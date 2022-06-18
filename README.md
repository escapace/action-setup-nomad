# setup-nomad

Sets up HashiCorp Nomad.

## Inputs

## `version`

**Optional** The version of Nomad to install. Instead of full version string you
can also specify constraint string starting with "<" (for example `<1.13.0`) to
install the latest version satisfying the constraint. A value of `latest` will
install the latest version of Nomad. Defaults to `latest`.

## Example usage

```yaml
uses: escapace/setup-nomad@v0.1.0
with:
  nomad-version: 'Mona the Octocat'
```
