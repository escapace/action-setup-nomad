import { describe, expect, it, vi } from 'vitest'
import {
  mapArch,
  mapOS,
  type NomadRelease,
  type ReleaseMetadata,
  selectNomadReleaseVersion,
  setupNomad,
} from './setup-nomad'

function release(version: string): ReleaseMetadata {
  return {
    name: 'nomad',
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
    const getBuild = vi.fn<NomadRelease['getBuild']>(() => ({
      filename: 'nomad_1.11.4_linux_amd64.zip',
      url: 'https://releases.hashicorp.com/nomad/1.11.4/nomad_1.11.4_linux_amd64.zip',
    }))
    const verify = vi.fn<NomadRelease['verify']>(async () => await Promise.resolve())
    const release: NomadRelease = {
      getBuild,
      verify,
      version: '1.11.4',
    }
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
    const findTool = vi.fn(() => '/opt/hostedtoolcache/nomad/1.11.4/amd64')
    const getRelease = vi.fn(async () => await Promise.resolve(release))

    await expect(
      setupNomad({
        arch: 'x64',
        cacheTool,
        downloadTool,
        enterprise: false,
        extractZip,
        findTool,
        getRelease,
        platform: 'linux',
        userAgent: 'test-agent',
        version: '~1.11.0',
      }),
    ).resolves.toBe('/opt/hostedtoolcache/nomad/1.11.4/amd64')

    expect(getRelease).toHaveBeenCalledWith('~1.11.0', false, 'test-agent')
    expect(getBuild).toHaveBeenCalledWith('linux', 'amd64')
    expect(findTool).toHaveBeenCalledWith('nomad', '1.11.4', 'amd64')
    expect(cacheTool).not.toHaveBeenCalled()
    expect(downloadTool).not.toHaveBeenCalled()
    expect(extractZip).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })

  it('downloads, verifies, extracts, and caches Nomad when no cached tool path exists', async () => {
    const build = {
      filename: 'nomad_1.11.4+ent_windows_amd64.zip',
      url: 'https://releases.hashicorp.com/nomad/1.11.4+ent/nomad_1.11.4+ent_windows_amd64.zip',
    }
    const getBuild = vi.fn<NomadRelease['getBuild']>(() => build)
    const verify = vi.fn<NomadRelease['verify']>(async () => await Promise.resolve())
    const release: NomadRelease = {
      getBuild,
      verify,
      version: '1.11.4+ent',
    }
    const cacheTool = vi.fn(
      async () => await Promise.resolve('/opt/hostedtoolcache/nomad-enterprise/1.11.4/amd64'),
    )
    const downloadTool = vi.fn(async () => await Promise.resolve('/tmp/nomad.zip'))
    const extractZip = vi.fn(async () => await Promise.resolve('/tmp/nomad'))
    const findTool = vi.fn(() => '')

    await expect(
      setupNomad({
        arch: 'x64',
        cacheTool,
        downloadTool,
        enterprise: true,
        extractZip,
        findTool,
        platform: 'win32',
        userAgent: 'test-agent',
        version: '~1.11.0',
        getRelease: async () => await Promise.resolve(release),
      }),
    ).resolves.toBe('/opt/hostedtoolcache/nomad-enterprise/1.11.4/amd64')

    expect(getBuild).toHaveBeenCalledWith('windows', 'amd64')
    expect(findTool).toHaveBeenCalledWith('nomad-enterprise', '1.11.4+ent', 'amd64')
    expect(downloadTool).toHaveBeenCalledWith(build.url)
    expect(verify).toHaveBeenCalledWith('/tmp/nomad.zip', build.filename)
    expect(extractZip).toHaveBeenCalledWith('/tmp/nomad.zip')
    expect(cacheTool).toHaveBeenCalledWith('/tmp/nomad', 'nomad-enterprise', '1.11.4+ent', 'amd64')
  })
})
