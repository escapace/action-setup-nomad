import { addPath, debug, getBooleanInput, getInput, setFailed } from '@actions/core'
import { downloadTool, extractZip, find as findTool } from '@actions/tool-cache'
import os from 'node:os'
import { setupNomad } from './setup-nomad'

const USER_AGENT = 'escapace/setup-nomad'

export async function run() {
  try {
    const toolPath = await setupNomad({
      arch: os.arch(),
      debug,
      downloadTool,
      enterprise: getBooleanInput('enterprise'),
      extractZip,
      findTool,
      platform: os.platform(),
      userAgent: USER_AGENT,
      version: getInput('nomad-version'),
    })

    addPath(toolPath)
  } catch (error) {
    setFailed(
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown Error',
    )
  }
}

void run()
