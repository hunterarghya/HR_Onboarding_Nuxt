import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

// Downloads a file from a URL someone outside the company gave us (a form's "resume link"), without
// letting that URL reach anything inside our network (SEC-04): no private, loopback, link-local or
// metadata addresses, checked on the address actually connected to, so DNS tricks don't get around it.

export class UnsafeDownloadError extends Error {}

/** Addresses a public file can't live on. */
const internal = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) internal.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96]
] as const) internal.addSubnet(net, prefix, 'ipv6')

export const isInternalAddress = (address: string): boolean => {
  const family = isIP(address)
  if (family === 0) return true // not an address at all: refuse
  if (family === 6) {
    // ::ffff:10.0.0.1 is the IPv4 address in disguise
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return internal.check(mapped[1]!, 'ipv4')
    return internal.check(address, 'ipv6')
  }
  return internal.check(address, 'ipv4')
}

export interface DownloadPolicy {
  protocols: readonly string[]
  /** false only in tests, which serve files from this machine */
  blockInternal: boolean
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
}

export const STRICT_POLICY: DownloadPolicy = { protocols: ['https:'], blockInternal: true, timeoutMs: 15_000, maxBytes: 10 * 1024 * 1024, maxRedirects: 3 }

/** DNS lookup that refuses internal addresses, used for the connection itself. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    const list = addresses as unknown as LookupAddress[]
    const blocked = list.find(a => isInternalAddress(a.address))
    if (blocked || list.length === 0) {
      return callback(new UnsafeDownloadError(`${hostname} points to an internal address`), '', 0)
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
    callback(null, list[0]!.address, list[0]!.family)
  })
}

const requestOnce = (url: URL, policy: DownloadPolicy) => new Promise<{ redirect?: string, body?: Buffer, contentType?: string }>((resolve, reject) => {
  if (policy.blockInternal && isIP(url.hostname.replace(/^\[|\]$/g, '')) && isInternalAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
    return reject(new UnsafeDownloadError(`${url.hostname} is an internal address`))
  }
  const client = url.protocol === 'https:' ? https : http
  const req = client.get(url, { lookup: policy.blockInternal ? guardedLookup : undefined, timeout: policy.timeoutMs }, (res) => {
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume()
      return resolve({ redirect: new URL(res.headers.location, url).toString() })
    }
    if (status !== 200) {
      res.resume()
      return reject(new UnsafeDownloadError(`HTTP ${status}`))
    }
    const declared = Number(res.headers['content-length'] ?? 0)
    if (declared > policy.maxBytes) {
      res.destroy()
      return reject(new UnsafeDownloadError('File is too large'))
    }
    const chunks: Buffer[] = []
    let size = 0
    res.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > policy.maxBytes) {
        res.destroy()
        reject(new UnsafeDownloadError('File is too large'))
      } else chunks.push(chunk)
    })
    res.on('end', () => resolve({ body: Buffer.concat(chunks), contentType: res.headers['content-type'] }))
    res.on('error', reject)
  })
  req.on('timeout', () => req.destroy(new UnsafeDownloadError('Download timed out')))
  req.on('error', reject)
})

/**
 * The PDF at `rawUrl`, following at most `maxRedirects` redirects (each one checked again).
 * Throws UnsafeDownloadError for a refused address, scheme, size or a file that isn't a PDF.
 */
export const downloadPdf = async (rawUrl: string, policy: DownloadPolicy = STRICT_POLICY): Promise<Buffer> => {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafeDownloadError('Not a URL')
  }

  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    if (!policy.protocols.includes(url.protocol)) throw new UnsafeDownloadError(`${url.protocol} links aren't allowed`)
    if (url.username || url.password) throw new UnsafeDownloadError('Links with credentials aren\'t allowed')

    const result = await requestOnce(url, policy)
    if (result.redirect) {
      url = new URL(result.redirect)
      continue
    }
    const body = result.body!
    if (body.subarray(0, 5).toString('latin1') !== '%PDF-') throw new UnsafeDownloadError('Not a PDF')
    return body
  }
  throw new UnsafeDownloadError('Too many redirects')
}
