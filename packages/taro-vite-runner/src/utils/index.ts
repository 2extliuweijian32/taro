import { NODE_MODULES_REG } from '@tarojs/helper'
import { isString } from '@tarojs/shared'
import path from 'path'

import type { Target } from 'vite-plugin-static-copy'
import type { TaroCompiler as H5Compiler } from '../utils/compiler/h5'
import type { TaroCompiler as HarmonyCompiler } from '../utils/compiler/harmony'
import type { TaroCompiler as MiniCompiler } from '../utils/compiler/mini'
import type { H5BuildConfig, HarmonyBuildConfig, MiniBuildConfig } from './types'

export function convertCopyOptions (taroConfig: MiniBuildConfig | H5BuildConfig | HarmonyBuildConfig) {
  const copy = taroConfig.copy
  const copyOptions: Target[] = []
  copy?.patterns.forEach(({ from, to }) => {
    const { base, ext } = path.parse(to)
    to = to
      .replace(new RegExp('^' + taroConfig.outputRoot + '/'), '')
    let rename

    if (ext) {
      to = to.replace(base, '')
      rename = base
    } else {
      rename = '/'
    }


    copyOptions.push({
      src: from,
      dest: to,
      rename
    })
  })
  return copyOptions
}

export function prettyPrintJson (obj: Record<string, any>) {
  return JSON.stringify(obj, null, 2)
}

export function getComponentName (compiler: MiniCompiler | H5Compiler | HarmonyCompiler, componentPath: string) {
  let componentName: string
  if (NODE_MODULES_REG.test(componentPath)) {
    componentName = componentPath
      .replace(compiler.cwd, '')
      .replace(/\\/g, '/')
      .replace(path.extname(componentPath), '')
      .replace(/node_modules/gi, 'npm')
  } else {
    componentName = componentPath
      .replace(compiler.sourceDir, '')
      .replace(/\\/g, '/')
      .replace(path.extname(componentPath), '')
  }

  return componentName.replace(/^(\/|\\)/, '')
}

const virtualModulePrefix ='\0'
const virtualModulePrefixREG = new RegExp(`^${virtualModulePrefix}`)

export function appendVirtualModulePrefix (id: string): string {
  return virtualModulePrefix + id
}

export function stripVirtualModulePrefix (id: string): string {
  return id.replace(virtualModulePrefixREG, '')
}

export function isVirtualModule (id: string): boolean {
  return virtualModulePrefixREG.test(id)
}

export function isRelativePath (id: string | undefined): boolean {
  if (!isString(id)) return false

  if (path.isAbsolute(id)) return false

  if (/^[a-z][a-z0-9+.-]*:/i.test(id)) return false

  return true
}

export function stripMultiPlatformExt (id: string): string {
  return id.replace(new RegExp(`\\.${process.env.TARO_ENV}$`), '')
}

export const addTrailingSlash = (url = '') => (url.charAt(url.length - 1) === '/' ? url : url + '/')

export function getMode (config: H5BuildConfig | MiniBuildConfig | HarmonyBuildConfig) {
  const preMode = config.mode || process.env.NODE_ENV
  const modes: ('production' | 'development' | 'none')[] = ['production', 'development', 'none']
  const mode = modes.find(e => e === preMode)
    || (!config.isWatch || process.env.NODE_ENV === 'production' ? 'production' : 'development')
  return mode
}
