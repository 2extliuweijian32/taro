import { isFunction } from '@tarojs/shared'

import { TaroCompiler } from '../utils/compiler/harmony'

import type { PluginOption } from 'vite'

export default function (compiler: TaroCompiler): PluginOption {
  const { taroConfig } = compiler
  return {
    name: 'taro:vite-harmony-pipeline',
    enforce: 'pre',
    buildStart () {
      this.load({ id: TaroCompiler.label })
      const info = this.getModuleInfo(TaroCompiler.label)
      if (info) {
        compiler.setRollupCtx(this)
        info.meta = { compiler }
      }
    },
    load (id) {
      if (id === TaroCompiler.label) return ''
    },
    closeBundle () {
      compiler.cleanup()

      const onBuildFinish = taroConfig.onBuildFinish
      if (isFunction(onBuildFinish)) {
        onBuildFinish({
          error: null,
          stats: {},
          isWatch: taroConfig.isWatch
        })
      }
    }
  }
}
