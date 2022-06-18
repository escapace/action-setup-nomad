import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import { getRelease } from '@hashicorp/js-releases'
import { isError, isString } from 'lodash-es'
import os from 'os'

const mapArch = (arch: string): string =>
  ({
    x32: '386',
    arm64: 'arm64',
    x64: 'amd64'
  }[arch] ?? arch)

const mapOS = (os: string): string =>
  ({
    win32: 'windows'
  }[os] ?? os)

const USER_AGENT = 'escapace/setup-nomad'

async function download(
  url: string,
  verify: (zipFile: string) => Promise<void>
) {
  core.debug(`Downloading Nomad from ${url}`)

  const pathToZip = await tc.downloadTool(url)

  await verify(pathToZip)

  // let pathToFile = ''
  //
  // core.debug('Extracting Nomad zip file')
  //
  // if (os.platform().startsWith('win')) {
  //   core.debug(`Nomad download path is ${pathToZip}`)
  //
  //   const fixedPathToZip = `${pathToZip}.zip`
  //
  //   await io.mv(pathToZip, fixedPathToZip)
  //
  //   core.debug(`Moved download to ${fixedPathToZip}`)
  //
  //   pathToFile = await tc.extractZip(fixedPathToZip)
  // } else {
  //   pathToFile = await tc.extractZip(pathToZip)
  // }

  const pathToFile = await tc.extractZip(pathToZip)

  core.debug(`Nomad path is ${pathToFile}.`)

  if (!isString(pathToZip) || !isString(pathToFile)) {
    throw new Error(`Unable to download Nomad from ${url}`)
  }

  return pathToFile
}

export async function run() {
  try {
    const version = core.getInput('nomad-version')
    const platform = mapOS(os.platform())
    const arch = mapArch(os.arch())

    core.debug(`Finding releases for Nomad version ${version}`)

    const release = await getRelease('nomad', version, USER_AGENT)

    core.debug(
      `Getting build for Nomad version ${release.version}: ${platform} ${arch}`
    )

    const build = release.getBuild(platform, arch)

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!build) {
      throw new Error(
        `Nomad version ${version} not available for ${platform} and ${arch}`
      )
    }

    core.addPath(
      tc.find('nomad', release.version, arch) ??
        (await download(
          build.url,
          async (zipFile: string) =>
            await release.verify(zipFile, build.filename)
        ))
    )
  } catch (error) {
    if (isError(error)) {
      core.setFailed(error.message)
    } else if (isString(error)) {
      core.setFailed(error)
    }

    core.setFailed('Unknown Error')
  }
}

void run()
