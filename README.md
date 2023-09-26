## action-setup-nomad

Sets up HashiCorp Nomad.

### Inputs

#### `nomad-version`

**Optional** The version of Nomad to install. Instead of full version string you
can also specify a semantic version range (for example `^1.3.1`) to install the
latest version satisfying the constraint. A value of `latest` will install the
latest version of Nomad. Defaults to `latest`.

### Example usage

```yaml
uses: escapace/action-setup-nomad@v0.2.0
with:
  nomad-version: ~1.3.1
```
