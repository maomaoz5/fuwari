import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock import.meta.env.BASE_URL
beforeEach(() => {
  vi.stubEnv('BASE_URL', '/')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Mock i18n modules to avoid deep dependency chain
vi.mock('@i18n/i18nKey', () => {
  return {
    default: { uncategorized: 'uncategorized' },
  }
})

vi.mock('@i18n/translation', () => ({
  i18n: (key: string) => {
    if (key === 'uncategorized') return 'Uncategorized'
    return key
  },
}))

import {
  pathsEqual,
  getPostUrlBySlug,
  getTagUrl,
  getCategoryUrl,
  getDir,
  url,
} from '../url-utils'

describe('pathsEqual', () => {
  it('returns true for identical paths', () => {
    expect(pathsEqual('/about', '/about')).toBe(true)
  })

  it('returns true for paths with/without leading slash', () => {
    expect(pathsEqual('/about', 'about')).toBe(true)
  })

  it('returns true for paths with/without trailing slash', () => {
    expect(pathsEqual('/about/', '/about')).toBe(true)
    expect(pathsEqual('/about/', 'about/')).toBe(true)
  })

  it('returns true for case-insensitive comparison', () => {
    expect(pathsEqual('/About', '/about')).toBe(true)
    expect(pathsEqual('/ABOUT', '/about')).toBe(true)
  })

  it('returns true for multi-level paths', () => {
    expect(pathsEqual('/a/b/c', '/a/b/c')).toBe(true)
    expect(pathsEqual('/a/b/c/', 'a/b/c')).toBe(true)
  })

  it('returns false for different paths', () => {
    expect(pathsEqual('/about', '/contact')).toBe(false)
    expect(pathsEqual('/a/b', '/a/c')).toBe(false)
  })

  it('handles empty strings', () => {
    expect(pathsEqual('', '')).toBe(true)
    expect(pathsEqual('/', '')).toBe(true)
    expect(pathsEqual('/', '/')).toBe(true)
  })

  it('handles single slash vs multiple slashes', () => {
    // regex only strips one leading + one trailing slash, so '///' -> '/' while '/' -> ''
    expect(pathsEqual('/', '///')).toBe(false)
  })
})

describe('getPostUrlBySlug', () => {
  it('returns correct URL for a normal slug', () => {
    expect(getPostUrlBySlug('hello-world')).toBe('/posts/hello-world/')
  })

  it('returns correct URL for empty slug', () => {
    // joinUrl deduplicates slashes, so /posts// becomes /posts/
    expect(getPostUrlBySlug('')).toBe('/posts/')
  })

  it('handles special characters in slug', () => {
    const result = getPostUrlBySlug('my post #1')
    expect(result).toBe('/posts/my post #1/')
  })
})

describe('getTagUrl', () => {
  it('returns correct URL for a normal tag', () => {
    expect(getTagUrl('javascript')).toBe('/archive/?tag=javascript')
  })

  it('returns archive URL for empty tag', () => {
    expect(getTagUrl('')).toBe('/archive/')
  })

  it('encodes spaces in tag', () => {
    expect(getTagUrl('web dev')).toBe('/archive/?tag=web%20dev')
  })

  it('encodes special characters in tag', () => {
    expect(getTagUrl('c++')).toBe('/archive/?tag=c%2B%2B')
  })

  it('trims whitespace from tag', () => {
    expect(getTagUrl('  js  ')).toBe('/archive/?tag=js')
  })
})

describe('getCategoryUrl', () => {
  it('returns correct URL for a normal category', () => {
    expect(getCategoryUrl('tech')).toBe('/archive/?category=tech')
  })

  it('returns uncategorized URL for null category', () => {
    expect(getCategoryUrl(null)).toBe('/archive/?uncategorized=true')
  })

  it('returns uncategorized URL for empty string category', () => {
    expect(getCategoryUrl('')).toBe('/archive/?uncategorized=true')
  })

  it('returns uncategorized URL for whitespace-only category', () => {
    expect(getCategoryUrl('   ')).toBe('/archive/?uncategorized=true')
  })

  it('returns uncategorized URL for "Uncategorized" category (case-insensitive)', () => {
    expect(getCategoryUrl('Uncategorized')).toBe('/archive/?uncategorized=true')
    expect(getCategoryUrl('uncategorized')).toBe('/archive/?uncategorized=true')
  })

  it('encodes special characters in category', () => {
    expect(getCategoryUrl('web & more')).toBe('/archive/?category=web%20%26%20more')
  })
})

describe('getDir', () => {
  it('returns directory part of a path', () => {
    expect(getDir('/a/b/c.txt')).toBe('/a/b/')
  })

  it('returns "/" for root-level file', () => {
    expect(getDir('/file.txt')).toBe('/')
  })

  it('returns "/" for root path', () => {
    expect(getDir('/')).toBe('/')
  })

  it('returns "/" for path with no slash', () => {
    expect(getDir('filename')).toBe('/')
  })

  it('handles path with trailing slash', () => {
    expect(getDir('/a/b/')).toBe('/a/b/')
  })

  it('handles empty path', () => {
    expect(getDir('')).toBe('/')
  })
})

describe('url', () => {
  it('returns path prefixed with BASE_URL', () => {
    expect(url('/about/')).toBe('/about/')
  })

  it('handles root path', () => {
    expect(url('/')).toBe('/')
  })

  it('deduplicates slashes', () => {
    expect(url('//double//')).toBe('/double/')
  })
})
