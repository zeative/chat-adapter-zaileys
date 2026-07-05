import nextra from 'nextra'

const withNextra = nextra({})

// GitHub Pages project site: https://zeative.github.io/chat-adapter-zaileys
// `output: 'export'` + static basePath. Override the prefix with DOCS_BASE_PATH
// (set to '' for a custom domain / user page).
const basePath = process.env.DOCS_BASE_PATH ?? '/chat-adapter-zaileys'

export default withNextra({
  output: 'export',
  images: { unoptimized: true },
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Static export + basePath: trailingSlash makes the index RSC prefetch payload
  // resolve to `${basePath}/index.txt` instead of the 404-ing `${basePath}.txt`.
  trailingSlash: true,
})
