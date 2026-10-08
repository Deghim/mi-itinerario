import type { NextConfig } from 'next'

const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY?.toLowerCase() === 'deghim/mi-itinerario'

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: isGitHubPagesBuild ? '/mi-itinerario' : '',
  images: { unoptimized: true },
}

export default nextConfig
