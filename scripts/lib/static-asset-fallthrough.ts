interface PublicAssetRoot {
  baseURL?: string
  fallthrough?: boolean
}

function normalizeAssetBase(value: string): string {
  return `/${value.replace(/^\/+|\/+$/g, '')}/`
}

export function withBuildAssetMissFallthrough<T extends PublicAssetRoot>(
  publicAssets: readonly (T | undefined)[],
  buildAssetsDir: string,
): (T | undefined)[] {
  const buildAssetBase = normalizeAssetBase(buildAssetsDir)

  return publicAssets.map((asset) => {
    if (!asset)
      return asset

    const assetBase = normalizeAssetBase(asset.baseURL || '/')
    const ownsBuildAssets = assetBase !== '/' && buildAssetBase.startsWith(assetBase)

    return ownsBuildAssets ? { ...asset, fallthrough: true } : asset
  })
}
