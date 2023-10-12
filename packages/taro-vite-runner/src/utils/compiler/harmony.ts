import {
  chalk,
  fs,
  readConfig,
  recursiveMerge,
  resolveMainFilePath,
} from '@tarojs/helper'
import { isArray, isFunction } from '@tarojs/shared'
import {
  ViteFileType,
  ViteHarmonyBuildConfig,
  ViteHarmonyCompilerContext,
  VitePageMeta
} from '@tarojs/taro/types/compile/viteCompilerContext'
import JSON5 from 'json5'
import path from 'path'

import defaultConfig from '../../defaultConfig/defaultConfig.harmony'
import { CompilerContext } from './base'

import type { AppConfig, PageConfig } from '@tarojs/taro'

function readJson5Sync (file: string) {
  const raw = fs.readFileSync(file, 'utf-8')
  return JSON5.parse(raw)
}

export class TaroCompilerContext extends CompilerContext<ViteHarmonyBuildConfig> implements ViteHarmonyCompilerContext {
  commonChunks: string[]
  fileType: ViteFileType
  useETS: boolean
  useJSON5: boolean
  nativeExt = ['.ets']

  constructor (appPath: string, taroConfig: ViteHarmonyBuildConfig) {
    super(appPath, taroConfig)

    this.fileType = this.taroConfig.fileType
    this.useETS = taroConfig.useETS !== false
    this.useJSON5 = taroConfig.useJSON5 !== false
    this.commonChunks = this.getCommonChunks()
    this.app = this.getApp()
    this.pages = this.getPages()
  }

  processConfig () {
    this.taroConfig = recursiveMerge({}, defaultConfig, this.rawTaroConfig)
  }

  getCommonChunks () {
    const { commonChunks } = this.taroConfig
    const defaultCommonChunks = ['runtime', 'vendors', 'taro', 'common']
    let customCommonChunks: string[] = defaultCommonChunks
    if (isFunction(commonChunks)) {
      customCommonChunks = commonChunks(defaultCommonChunks.concat()) || defaultCommonChunks
    } else if (isArray(commonChunks) && commonChunks.length) {
      customCommonChunks = commonChunks
    }
    return customCommonChunks
  }

  compilePage = (pageName: string): VitePageMeta => {
    const { sourceDir, frameworkExts, nativeExt } = this

    const scriptPath = resolveMainFilePath(path.join(sourceDir, pageName), frameworkExts)
    const nativePath = resolveMainFilePath(path.join(sourceDir, pageName), nativeExt)
    const configPath = this.getConfigFilePath(scriptPath)
    const config: PageConfig = readConfig(configPath) || {}

    const pageMeta = {
      name: pageName,
      scriptPath,
      configPath,
      config,
      isNative: this.isNativePageORComponent(nativePath),
    }

    this.filesConfig[this.getConfigFilePath(pageMeta.name)] = {
      path: configPath,
      content: config
    }
    this.configFileList.push(pageMeta.configPath)

    return pageMeta
  }

  modifyHarmonyResources(id = '', data: any = {}) {
    const { outputRoot = 'dist' } = this.taroConfig
    const [, key, value] = id.match(/^\$(.+):(.+)$/) || []
    if (!key || !value) {
      return console.warn(chalk.red(`无效的资源 ID：${id}`))
    }
    const isProfile = key === 'profile'
    const targetPath = path.join(path.resolve(outputRoot, '..'), 'resources/base', isProfile ? 'profile' : 'element')
    const fileName = `${isProfile ? value : key}.json`
    const configPath = path.join(targetPath, fileName)
    const config = readJson5Sync(configPath)
    if (isProfile) {
      Object.assign(config, data)
    } else {
      const list = config[key] || []
      const idx = list.findIndex(item => item.name === value)
      if (idx >= 0) {
        list[idx].value = data
      } else {
        list.push({
          name: value,
          value: data,
        })
      }
    }
    fs.writeJsonSync(configPath, config, { spaces: 2 })
  }

  // Note: 修改 harmony Hap 的配置文件，当前仅支持注入路由配置
  modifyHarmonyConfig (config: Partial<AppConfig> = {}) {
    const { pages = [] } = config
    const { projectPath, hapName = 'entry', outputRoot = 'dist', name = 'default', designWidth = 750 } = this.taroConfig
    const buildProfilePath = path.join(projectPath, `build-profile.${this.useJSON5 !== false ? 'json5' : 'json'}`)
    const srcPath = `./${hapName}`
    const hapConfigPath = path.join(path.resolve(outputRoot, '..'), `${this.useJSON5 !== false ? 'module.json5' : 'config.json'}`)
    try {
      const profile = readJson5Sync(buildProfilePath)
      profile.modules ||= []
      const target = profile.modules[0]
      if (target) {
        target.name = name
        target.srcPath = srcPath
      } else {
        profile.modules.push({
          name,
          srcPath,
          targets: [
            {
              name: 'default',
              applyToProducts: [
                'default'
              ]
            }
          ]
        })
      }
      fs.writeJsonSync(buildProfilePath, profile, { spaces: 2 })

      const hapConfig = readJson5Sync(hapConfigPath)
      const window = {
        designWidth: (typeof designWidth === 'function' ? designWidth() : designWidth) || 750,
        autoDesignWidth: false
      }
      hapConfig.module ||= {}
      if (this.useJSON5 !== false) {
        let pageMetaId = '$profile:main_pages'
        // Stage 模型
        const target = hapConfig.module
        if (target) {
          const appId = config.appId || 'app'
          const entryPath = path.join(this.taroConfig.outputRoot || 'dist', `${appId}.ets`)
          const srcEntry = `./${path.relative(path.dirname(hapConfigPath), entryPath)}`
          target.name = name
          target.mainElement = appId
          const ability = target.abilities?.[0]
          if (ability) {
            ability.name = appId
            ability.srcEntry = srcEntry
          } else {
            target.abilities ||= []
            target.abilities.push({
              name: appId,
              srcEntry,
              description: '$string:ability_desc',
              icon: '$media:icon',
              label: '$string:ability_label',
              startWindowIcon: '$media:icon',
              startWindowBackground: '$color:start_window_background',
              exported: true,
            })
          }
          if (typeof target.pages === 'string') {
            pageMetaId = target.pages
          } else {
            target.pages = pageMetaId
          }
        }
        this.modifyHarmonyResources(pageMetaId, {
          src: [...pages],
          window,
        })
        /**
         * TOD0: 将 app 其配置为 mainElement 入口
         */
      } else {
        // FA 模型
        hapConfig.module.js ||= []
        const jsFAs = hapConfig.module.js
        const target = jsFAs.find(item => item.name === name)
        const mode = {
          syntax: this.useETS ? 'ets': 'hml',
          type: 'pageAbility',
        }
        if (target) {
          if (JSON.stringify(target.pages) === JSON.stringify(pages)) return
          target.mode = mode
          target.pages = pages
          target.window = window
        } else {
          jsFAs.push({
            name,
            mode,
            pages,
            window,
          })
        }
      }
      fs.writeJsonSync(hapConfigPath, hapConfig, { spaces: 2 })
    } catch (error) {
      console.warn(chalk.red('设置鸿蒙 Hap 配置失败：', error))
    }
  }

  // Note: 更新 oh-package 中项目依赖声明
  modifyHostPackageDep (
    outDir: string,
    hmsDeps: Record<string, string> = {},
    hmsDevDeps: Record<string, string> = {},
  ) {
    const packageJsonFile = path.resolve(outDir, `../../../${this.useJSON5 !== false ? 'oh-package.json5' : 'package.json'}`)

    const isExists = fs.pathExistsSync(packageJsonFile)
    if (!isExists) return

    const pkg = readJson5Sync(packageJsonFile)
    pkg.dependencies ||= {}
    for (const dep in hmsDeps) {
      pkg.dependencies[dep] = hmsDeps[dep]
    }
    pkg.devDependencies ||= {}
    for (const dep in hmsDevDeps) {
      pkg.devDependencies[dep] = hmsDevDeps[dep]
    }
    fs.writeJsonSync(packageJsonFile, pkg, { spaces: 2 })
  }

  /** 工具函数 */
  getScriptPath (filePath: string) {
    return this.getTargetFilePath(filePath, this.fileType.script)
  }

  getStylePath (filePath: string) {
    return this.getTargetFilePath(filePath, this.fileType.style)
  }

  getConfigPath (filePath: string) {
    return this.getTargetFilePath(filePath, this.fileType.config)
  }
}
