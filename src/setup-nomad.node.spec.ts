import { describe, expect, it, vi } from 'vitest'
import {
  mapArch,
  mapOS,
  type NomadRelease,
  type ReleaseMetadata,
  selectNomadReleaseVersion,
  setupNomad,
} from './setup-nomad'

const toolCacheRoot = '/opt/hostedtoolcache'

function release(version: string): ReleaseMetadata {
  return {
    name: 'nomad',
    version,
  }
}

function createRelease(
  version: string,
  build = {
    filename: `nomad_${version}_linux_amd64.zip`,
    url: `https://releases.hashicorp.com/nomad/${version}/nomad_${version}_linux_amd64.zip`,
  },
): NomadRelease {
  return {
    getBuild: vi.fn<NomadRelease['getBuild']>(() => build),
    verify: vi.fn<NomadRelease['verify']>(async () => await Promise.resolve()),
    version,
  }
}

describe('mapArch', () => {
  it('maps Node architecture names to Nomad release architecture names', () => {
    expect(mapArch('x64')).toBe('amd64')
    expect(mapArch('x32')).toBe('386')
    expect(mapArch('arm64')).toBe('arm64')
    expect(mapArch('s390x')).toBe('s390x')
  })
})

describe('mapOS', () => {
  it('maps Node platform names to Nomad release OS names', () => {
    expect(mapOS('win32')).toBe('windows')
    expect(mapOS('linux')).toBe('linux')
  })
})

describe('selectNomadReleaseVersion', () => {
  it('excludes enterprise releases when enterprise is false', () => {
    expect(
      selectNomadReleaseVersion(
        {
          '1.0.0': release('1.0.0'),
          '1.1.0': release('1.1.0'),
          '1.2.0+ent': release('1.2.0+ent'),
        },
        'latest',
        false,
      ),
    ).toBe('1.1.0')
  })

  it('selects enterprise releases when enterprise is true', () => {
    expect(
      selectNomadReleaseVersion(
        {
          '1.0.0': release('1.0.0'),
          '1.1.0': release('1.1.0'),
          '1.2.0+ent': release('1.2.0+ent'),
        },
        'latest',
        true,
      ),
    ).toBe('1.2.0+ent')
  })

  it('resolves semver ranges without selecting enterprise releases by default', () => {
    expect(
      selectNomadReleaseVersion(
        {
          '1.11.2': release('1.11.2'),
          '1.11.3': release('1.11.3'),
          '1.11.4+ent': release('1.11.4+ent'),
        },
        '~1.11.0',
        false,
      ),
    ).toBe('1.11.3')
  })

  it('resolves semver ranges to enterprise releases when enterprise is true', () => {
    expect(
      selectNomadReleaseVersion(
        {
          '1.11.2': release('1.11.2'),
          '1.11.3': release('1.11.3'),
          '1.11.4+ent': release('1.11.4+ent'),
        },
        '~1.11.0',
        true,
      ),
    ).toBe('1.11.4+ent')
  })

  it('resolves a community version constraint to its enterprise build when enterprise is true', () => {
    expect(
      selectNomadReleaseVersion(
        {
          '1.11.4': release('1.11.4'),
          '1.11.4+ent': release('1.11.4+ent'),
        },
        '1.11.4',
        true,
      ),
    ).toBe('1.11.4+ent')
  })

  it('keeps exact enterprise version requests when enterprise is true', () => {
    expect(
      selectNomadReleaseVersion(
        {
          '1.11.4': release('1.11.4'),
          '1.11.4+ent': release('1.11.4+ent'),
        },
        '1.11.4+ent',
        true,
      ),
    ).toBe('1.11.4+ent')
  })

  it('rejects exact enterprise version requests when enterprise is false', () => {
    expect(() =>
      selectNomadReleaseVersion(
        {
          '1.11.4': release('1.11.4'),
          '1.11.4+ent': release('1.11.4+ent'),
        },
        '1.11.4+ent',
        false,
      ),
    ).toThrow('excluded by the enterprise option')
  })
})

describe('setupNomad', () => {
  it('uses a cached Nomad tool path when available', async () => {
    const release = createRelease('1.11.4')
    const cacheTool =
      vi.fn<
        (
          sourceDirectory: string,
          toolName: string,
          version: string,
          arch: string,
        ) => Promise<string>
      >()
    const downloadTool = vi.fn<(url: string) => Promise<string>>()
    const extractZip = vi.fn<(zipFile: string) => Promise<string>>()
    const findTool = vi.fn(() => '/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64')
    const restoreActionsCache =
      vi.fn<(paths: string[], key: string) => Promise<string | undefined>>()
    const saveActionsCache = vi.fn<(paths: string[], key: string) => Promise<number>>()

    await expect(
      setupNomad({
        actionsCacheEnabled: true,
        arch: 'x64',
        cacheTool,
        downloadTool,
        enterprise: false,
        extractZip,
        findTool,
        platform: 'linux',
        restoreActionsCache,
        saveActionsCache,
        toolCacheRoot,
        userAgent: 'test-agent',
        version: '~1.11.0',
        actionsCacheFeatureAvailable: () => true,
        getRelease: async () => await Promise.resolve(release),
        removePath: async () => await Promise.resolve(),
      }),
    ).resolves.toBe('/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64')

    expect(release.getBuild).toHaveBeenCalledWith('linux', 'amd64')
    expect(findTool).toHaveBeenCalledWith('escapace-nomad', '1.11.4', 'amd64')
    expect(restoreActionsCache).not.toHaveBeenCalled()
    expect(saveActionsCache).not.toHaveBeenCalled()
    expect(cacheTool).not.toHaveBeenCalled()
    expect(downloadTool).not.toHaveBeenCalled()
    expect(extractZip).not.toHaveBeenCalled()
    expect(release.verify).not.toHaveBeenCalled()
  })

  it('restores Nomad from the GitHub Actions cache before downloading', async () => {
    const release = createRelease('1.11.4')
    const cacheTool =
      vi.fn<
        (
          sourceDirectory: string,
          toolName: string,
          version: string,
          arch: string,
        ) => Promise<string>
      >()
    const downloadTool = vi.fn<(url: string) => Promise<string>>()
    const extractZip = vi.fn<(zipFile: string) => Promise<string>>()
    const findTool = vi
      .fn<(...parameters: [string, string, string]) => string>()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64')
    const removePath = vi.fn(async () => await Promise.resolve())
    const restoreActionsCache = vi.fn(async () => await Promise.resolve('nomad-cache-key'))
    const saveActionsCache = vi.fn<(paths: string[], key: string) => Promise<number>>()

    await expect(
      setupNomad({
        actionsCacheEnabled: true,
        arch: 'x64',
        cacheTool,
        downloadTool,
        enterprise: false,
        extractZip,
        findTool,
        platform: 'linux',
        removePath,
        restoreActionsCache,
        saveActionsCache,
        toolCacheRoot,
        userAgent: 'test-agent',
        version: '~1.11.0',
        actionsCacheFeatureAvailable: () => true,
        getRelease: async () => await Promise.resolve(release),
      }),
    ).resolves.toBe('/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64')

    expect(removePath).toHaveBeenCalledWith('/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64')
    expect(removePath).toHaveBeenCalledWith(
      '/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64.complete',
    )
    expect(restoreActionsCache).toHaveBeenCalledWith(
      [
        '/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64',
        '/opt/hostedtoolcache/escapace-nomad/1.11.4/amd64.complete',
      ],
      'action-setup-nomad-tool-cache-escapace-nomad-1.11.4-linux-amd64',
    )
    expect(downloadTool).not.toHaveBeenCalled()
    expect(cacheTool).not.toHaveBeenCalled()
    expect(saveActionsCache).not.toHaveBeenCalled()
  })

  it('downloads, verifies, extracts, locally caches, and saves Nomad on cache misses', async () => {
    const build = {
      filename: 'nomad_1.11.4+ent_windows_amd64.zip',
      url: 'https://releases.hashicorp.com/nomad/1.11.4+ent/nomad_1.11.4+ent_windows_amd64.zip',
    }
    const release = createRelease('1.11.4+ent', build)
    const cacheTool = vi.fn(
      async () =>
        await Promise.resolve('/opt/hostedtoolcache/escapace-nomad-enterprise/1.11.4/amd64'),
    )
    const downloadTool = vi.fn(async () => await Promise.resolve('/tmp/nomad.zip'))
    const extractZip = vi.fn(async () => await Promise.resolve('/tmp/nomad'))
    const findTool = vi.fn(() => '')
    const restoreActionsCache = vi.fn(async () => await Promise.resolve(undefined))
    const saveActionsCache = vi.fn(async () => await Promise.resolve(1))

    await expect(
      setupNomad({
        actionsCacheEnabled: true,
        arch: 'x64',
        cacheTool,
        downloadTool,
        enterprise: true,
        extractZip,
        findTool,
        platform: 'win32',
        restoreActionsCache,
        saveActionsCache,
        toolCacheRoot,
        userAgent: 'test-agent',
        version: '~1.11.0',
        actionsCacheFeatureAvailable: () => true,
        getRelease: async () => await Promise.resolve(release),
        removePath: async () => await Promise.resolve(),
      }),
    ).resolves.toBe('/opt/hostedtoolcache/escapace-nomad-enterprise/1.11.4/amd64')

    expect(release.getBuild).toHaveBeenCalledWith('windows', 'amd64')
    expect(findTool).toHaveBeenCalledWith('escapace-nomad-enterprise', '1.11.4+ent', 'amd64')
    expect(downloadTool).toHaveBeenCalledWith(build.url)
    expect(release.verify).toHaveBeenCalledWith('/tmp/nomad.zip', build.filename)
    expect(extractZip).toHaveBeenCalledWith('/tmp/nomad.zip')
    expect(cacheTool).toHaveBeenCalledWith(
      '/tmp/nomad',
      'escapace-nomad-enterprise',
      '1.11.4+ent',
      'amd64',
    )
    expect(saveActionsCache).toHaveBeenCalledWith(
      [
        '/opt/hostedtoolcache/escapace-nomad-enterprise/1.11.4/amd64',
        '/opt/hostedtoolcache/escapace-nomad-enterprise/1.11.4/amd64.complete',
      ],
      'action-setup-nomad-tool-cache-escapace-nomad-enterprise-1.11.4-windows-amd64',
    )
  })
})
