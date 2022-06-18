import { debug, getInput, addPath, setFailed } from '@actions/core'
import { downloadTool, extractZip, find } from '@actions/tool-cache'
import { getRelease } from '@hashicorp/js-releases'
import { isError, isString, isEmpty } from 'lodash-es'
import os from 'os'

const mapArch = (value: string): string =>
  ({
    x32: '386',
    arm64: 'arm64',
    x64: 'amd64'
  }[value] ?? value)

const mapOS = (value: string): string =>
  ({
    win32: 'windows'
  }[value] ?? value)

const USER_AGENT = 'escapace/setup-nomad'

async function download(
  url: string,
  verify: (zipFile: string) => Promise<void>
) {
  debug(`Downloading Nomad from ${url}`)

  const zip = await downloadTool(url)

  await verify(zip)

  const pathToFile = await extractZip(zip)

  debug(`Nomad path is ${pathToFile}.`)

  if (!isString(zip) || !isString(pathToFile)) {
    throw new Error(`Unable to download Nomad from ${url}`)
  }

  return pathToFile
}

export async function run() {
  try {
    const version = getInput('nomad-version')
    const platform = mapOS(os.platform())
    const arch = mapArch(os.arch())

    debug(`Finding releases for Nomad version ${version}`)

    const release = await getRelease('nomad', version, USER_AGENT)

    debug(
      `Getting build for Nomad version ${release.version}: ${platform} ${arch}`
    )

    const build = release.getBuild(platform, arch)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!build) {
      throw new Error(
        `Nomad version ${version} not available for ${platform} and ${arch}`
      )
    }

    let toolPath = find('nomad', release.version, arch)

    if (!isString(toolPath) || isEmpty(toolPath)) {
      toolPath = await download(
        build.url,
        async (zipFile: string) => await release.verify(zipFile, build.filename)
      )
    }

    addPath(toolPath)
  } catch (error) {
    if (isError(error)) {
      setFailed(error.message)
    } else if (isString(error)) {
      setFailed(error)
    }

    setFailed('Unknown Error')
  }
}

void run()
