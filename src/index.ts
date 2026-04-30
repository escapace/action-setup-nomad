import { isFeatureAvailable, restoreCache, saveCache } from '@actions/cache'
import { addPath, debug, getBooleanInput, getInput, setFailed } from '@actions/core'
import {
  cacheDir as cacheTool,
  downloadTool,
  extractZip,
  find as findTool,
} from '@actions/tool-cache'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import { setupNomad } from './setup-nomad'

const USER_AGENT = 'action-setup-nomad'

export async function run() {
  try {
    const toolPath = await setupNomad({
      actionsCacheEnabled: getBooleanInput('cache'),
      actionsCacheFeatureAvailable: isFeatureAvailable,
      arch: os.arch(),
      cacheTool,
      debug,
      downloadTool,
      enterprise: getBooleanInput('enterprise'),
      extractZip,
      findTool,
      platform: os.platform(),
      restoreActionsCache: restoreCache,
      saveActionsCache: saveCache,
      toolCacheRoot: process.env.RUNNER_TOOL_CACHE ?? '',
      userAgent: USER_AGENT,
      version: getInput('nomad-version'),
      removePath: async (targetPath: string) => {
        await rm(targetPath, { force: true, recursive: true })
      },
    })

    addPath(toolPath)
  } catch (error) {
    setFailed(
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown Error',
    )
  }
}

void run()
