import { Release } from '@hashicorp/js-releases'
import semver from 'semver'

const PRODUCT = 'nomad'
const RELEASES_URL = 'https://releases.hashicorp.com'

export interface NomadBuild {
  filename: string
  url: string
}

export interface NomadRelease {
  version: string
  getBuild: (platform: string, arch: string) => NomadBuild | undefined
  verify: (zipFile: string, buildFilename: string) => Promise<void>
}

export interface ReleaseMetadata {
  name: string
  version: string
  builds?: NomadBuild[]
  shasums?: string
  shasums_signature?: string
  shasums_signatures?: string[]
}

export interface ReleaseIndex {
  name: string
  versions: Record<string, ReleaseMetadata>
}

export interface SetupNomadDependencies {
  downloadTool: (url: string) => Promise<string>
  extractZip: (zipFile: string) => Promise<string>
  findTool: (toolName: string, version: string, arch: string) => string
  debug?: (message: string) => void
  getRelease?: (version: string, enterprise: boolean, userAgent: string) => Promise<NomadRelease>
}

export interface SetupNomadOptions extends SetupNomadDependencies {
  arch: string
  enterprise: boolean
  platform: string
  userAgent: string
  version: string
}

const isEnterpriseVersion = (version: string): boolean => version.includes('+ent')

export const mapArch = (value: string): string =>
  ({
    arm64: 'arm64',
    x32: '386',
    x64: 'amd64',
  })[value] ?? value

export const mapOS = (value: string): string =>
  ({
    win32: 'windows',
  })[value] ?? value

async function fetchNomadReleaseIndex(userAgent: string): Promise<ReleaseIndex> {
  const response = await fetch(`${RELEASES_URL}/${PRODUCT}/index.json`, {
    headers: {
      'User-Agent': userAgent,
    },
  })

  if (!response.ok) {
    throw new Error(
      `Unable to fetch Nomad release index: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as ReleaseIndex
}

export function selectNomadReleaseVersion(
  versions: Record<string, ReleaseMetadata>,
  version: string,
  enterprise: boolean,
): string {
  if (versions[version] !== undefined && isEnterpriseVersion(version) === enterprise) {
    return version
  }

  if (versions[version] !== undefined && isEnterpriseVersion(version)) {
    throw new Error(`Nomad Enterprise version ${version} is excluded by the enterprise option`)
  }

  if (isEnterpriseVersion(version) && !enterprise) {
    throw new Error(`Nomad Enterprise version ${version} is excluded by the enterprise option`)
  }

  const availableVersions = Object.keys(versions).filter(
    (key) => semver.valid(key) !== null && isEnterpriseVersion(key) === enterprise,
  )

  const validVersion = semver.validRange(version, { loose: true })

  if (validVersion === null) {
    const releaseVersion = availableVersions
      .filter((availableVersion) => semver.prerelease(availableVersion) === null)
      .sort((a, b) => semver.rcompare(a, b))[0]

    if (releaseVersion === undefined) {
      throw new Error(`No Nomad ${enterprise ? 'Enterprise ' : ''}releases found`)
    }

    return releaseVersion
  }

  const releaseVersion = semver.maxSatisfying(availableVersions, validVersion)

  if (releaseVersion === null) {
    throw new Error(
      `No matching Nomad ${enterprise ? 'Enterprise ' : ''}version found for constraint "${validVersion}"`,
    )
  }

  return releaseVersion
}

async function getNomadRelease(
  version: string,
  enterprise: boolean,
  userAgent: string,
): Promise<NomadRelease> {
  const releaseIndex = await fetchNomadReleaseIndex(userAgent)
  const releaseVersion = selectNomadReleaseVersion(releaseIndex.versions, version, enterprise)
  const releaseMetadata = releaseIndex.versions[releaseVersion]

  if (releaseMetadata === undefined) {
    throw new Error(`Nomad version ${releaseVersion} not found in the release index`)
  }

  return new Release(releaseMetadata)
}

export async function setupNomad(options: SetupNomadOptions): Promise<string> {
  const platform = mapOS(options.platform)
  const arch = mapArch(options.arch)
  const getRelease = options.getRelease ?? getNomadRelease

  options.debug?.(
    `Finding ${options.enterprise ? 'Nomad Enterprise' : 'Nomad'} release for version ${options.version}`,
  )

  const release = await getRelease(options.version, options.enterprise, options.userAgent)

  options.debug?.(`Getting build for Nomad version ${release.version}: ${platform} ${arch}`)

  const build = release.getBuild(platform, arch)

  if (build === undefined) {
    throw new Error(`Nomad version ${options.version} not available for ${platform} and ${arch}`)
  }

  let toolPath = options.findTool(PRODUCT, release.version, arch)

  if (toolPath.length === 0) {
    options.debug?.(`Downloading Nomad from ${build.url}`)

    const zipFile = await options.downloadTool(build.url)

    await release.verify(zipFile, build.filename)

    toolPath = await options.extractZip(zipFile)

    options.debug?.(`Nomad path is ${toolPath}.`)

    if (toolPath.length === 0) {
      throw new Error(`Unable to download Nomad from ${build.url}`)
    }
  }

  return toolPath
}
