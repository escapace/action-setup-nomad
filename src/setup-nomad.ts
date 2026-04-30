import { Release } from '@hashicorp/js-releases'
import path from 'node:path'
import semver from 'semver'

const PRODUCT = 'nomad'
const RELEASES_URL = 'https://releases.hashicorp.com'
const ACTIONS_CACHE_KEY_PREFIX = 'action-setup-nomad-tool-cache'

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

export interface ActionsCacheRestoreOptions {
  lookupOnly?: boolean
}

export interface SetupNomadDependencies {
  cacheTool: (
    sourceDirectory: string,
    toolName: string,
    version: string,
    arch: string,
  ) => Promise<string>
  downloadTool: (url: string) => Promise<string>
  extractZip: (zipFile: string) => Promise<string>
  findTool: (toolName: string, version: string, arch: string) => string
  removePath: (targetPath: string) => Promise<void>
  actionsCacheFeatureAvailable?: () => boolean
  debug?: (message: string) => void
  getRelease?: (version: string, enterprise: boolean, userAgent: string) => Promise<NomadRelease>
  restoreActionsCache?: (
    paths: string[],
    key: string,
    restoreKeys?: string[],
    options?: ActionsCacheRestoreOptions,
  ) => Promise<string | undefined>
  saveActionsCache?: (paths: string[], key: string) => Promise<number>
}

export interface SetupNomadOptions extends SetupNomadDependencies {
  actionsCacheEnabled: boolean
  arch: string
  enterprise: boolean
  platform: string
  toolCacheRoot: string
  userAgent: string
  version: string
}

const isEnterpriseVersion = (version: string): boolean => version.includes('+ent')

const getToolCacheVariant = (version: string): string => {
  if (!isEnterpriseVersion(version)) {
    return 'community'
  }

  return version
    .slice(version.indexOf('+') + 1)
    .replace(/^ent\b/u, 'enterprise')
    .replaceAll(/[^a-z0-9]+/giu, '-')
    .toLowerCase()
}

const getToolCacheName = (version: string): string =>
  `${ACTIONS_CACHE_KEY_PREFIX}-${getToolCacheVariant(version)}`

const getToolCacheVersion = (version: string): string => semver.clean(version) ?? version

const getToolCachePaths = (
  toolCacheRoot: string,
  toolCacheName: string,
  version: string,
  arch: string,
): string[] => {
  const toolDirectory = path.join(toolCacheRoot, toolCacheName, getToolCacheVersion(version), arch)

  return [toolDirectory, `${toolDirectory}.complete`]
}

const getActionsCacheKey = (version: string, platform: string, arch: string): string =>
  [
    ACTIONS_CACHE_KEY_PREFIX,
    getToolCacheVariant(version),
    getToolCacheVersion(version),
    platform,
    arch,
  ].join('-')

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'

const isActionsCacheAvailable = (options: SetupNomadOptions): boolean => {
  if (!options.actionsCacheEnabled || options.toolCacheRoot.length === 0) {
    return false
  }

  try {
    return options.actionsCacheFeatureAvailable?.() ?? false
  } catch (error) {
    options.debug?.(`Unable to check GitHub Actions cache availability: ${getErrorMessage(error)}`)

    return false
  }
}

const tryRestoreActionsCache = async (
  options: SetupNomadOptions,
  paths: string[],
  key: string,
): Promise<void> => {
  if (!isActionsCacheAvailable(options) || options.restoreActionsCache === undefined) {
    return
  }

  try {
    await Promise.all(paths.map(async (targetPath) => await options.removePath(targetPath)))

    const restoredKey = await options.restoreActionsCache?.(paths, key)

    options.debug?.(
      restoredKey === undefined
        ? `No GitHub Actions cache found for ${key}`
        : `Restored GitHub Actions cache ${restoredKey}`,
    )
  } catch (error) {
    options.debug?.(`Unable to restore GitHub Actions cache ${key}: ${getErrorMessage(error)}`)
  }
}

const trySaveActionsCache = async (
  options: SetupNomadOptions,
  paths: string[],
  key: string,
): Promise<void> => {
  if (!isActionsCacheAvailable(options) || options.saveActionsCache === undefined) {
    return
  }

  try {
    await options.saveActionsCache(paths, key)
  } catch (error) {
    options.debug?.(`Unable to save GitHub Actions cache ${key}: ${getErrorMessage(error)}`)
  }
}

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

  const toolCacheName = getToolCacheName(release.version)
  const actionsCachePaths = getToolCachePaths(
    options.toolCacheRoot,
    toolCacheName,
    release.version,
    arch,
  )
  const actionsCacheKey = getActionsCacheKey(release.version, platform, arch)
  let toolPath = options.findTool(toolCacheName, release.version, arch)

  if (toolPath.length === 0) {
    await tryRestoreActionsCache(options, actionsCachePaths, actionsCacheKey)

    toolPath = options.findTool(toolCacheName, release.version, arch)
  }

  if (toolPath.length === 0) {
    options.debug?.(`Downloading Nomad from ${build.url}`)

    const zipFile = await options.downloadTool(build.url)

    await release.verify(zipFile, build.filename)

    const extractedPath = await options.extractZip(zipFile)

    options.debug?.(`Nomad path is ${extractedPath}.`)

    if (extractedPath.length === 0) {
      throw new Error(`Unable to download Nomad from ${build.url}`)
    }

    toolPath = await options.cacheTool(extractedPath, toolCacheName, release.version, arch)

    await trySaveActionsCache(options, actionsCachePaths, actionsCacheKey)
  }

  return toolPath
}
