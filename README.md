## action-setup-nomad

Install the HashiCorp Nomad CLI in GitHub Actions and add the selected community or Enterprise binary to `PATH`.

When a matching version was installed by this action before, the cached installation is reused.

```yaml
uses: escapace/action-setup-nomad@v1.0.0
with:
  nomad-version: ~1.3.1
```

### Inputs

#### `nomad-version`

Version or semantic version range to install. Use `latest` for the latest community release, or for the latest Enterprise release when `enterprise` is `true`.

Default: `latest`

#### `enterprise`

Install a Nomad Enterprise release instead of a community release.

Default: `false`

```yaml
uses: escapace/action-setup-nomad@v1.0.0
with:
  enterprise: true
  nomad-version: ^1.11.0
```
