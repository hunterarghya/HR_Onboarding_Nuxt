import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { downloadPdf, isInternalAddress, STRICT_POLICY, UnsafeDownloadError } from '../../server/integrations/http/safe-download'

describe('isInternalAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'qdrant'])(
    'refuses %s', (address) => {
      expect(isInternalAddress(address)).toBe(true)
    })

  it.each(['8.8.8.8', '142.250.183.14', '2606:4700::1111', '::ffff:8.8.8.8'])('allows %s', (address) => {
    expect(isInternalAddress(address)).toBe(false)
  })
})

describe('downloadPdf with the strict policy (what form links get)', () => {
  it.each([
    ['plain http', 'http://example.com/cv.pdf', /http: links/],
    ['another scheme', 'file:///etc/passwd', /file: links/],
    ['an internal service by name (SEC-04: http://qdrant:6333 was fetched)', 'https://localhost:6333/collections', /internal address/],
    ['a loopback address', 'https://127.0.0.1/cv.pdf', /internal address/],
    ['the cloud metadata address', 'https://169.254.169.254/latest/meta-data', /internal address/],
    ['an IPv6 loopback', 'https://[::1]/cv.pdf', /internal address/],
    ['credentials in the link', 'https://user:pass@example.com/cv.pdf', /credentials/],
    ['something that is not a link', 'my resume', /Not a URL/]
  ])('refuses %s', async (_label, url, reason) => {
    await expect(downloadPdf(url)).rejects.toThrow(UnsafeDownloadError)
    await expect(downloadPdf(url)).rejects.toThrow(reason)
  })
})

describe('downloadPdf limits (served from this machine, internal-address check off)', () => {
  let server: Server
  let base: string
  const local = { ...STRICT_POLICY, protocols: ['http:'], blockInternal: false, maxBytes: 1024, timeoutMs: 500 }

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/cv.pdf') return res.end('%PDF-1.4 resume')
      if (req.url === '/page.html') return res.end('<html>not a pdf</html>')
      if (req.url === '/big.pdf') return res.end(`%PDF-${'x'.repeat(5000)}`)
      if (req.url === '/hop') return res.writeHead(302, { location: '/cv.pdf' }).end()
      if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end()
      if (req.url === '/slow') return setTimeout(() => res.end('%PDF-late'), 2000)
      if (req.url === '/to-internal') return res.writeHead(302, { location: 'https://169.254.169.254/' }).end()
      res.writeHead(404).end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('downloads a PDF, following a redirect', async () => {
    expect((await downloadPdf(`${base}/hop`, local)).toString()).toBe('%PDF-1.4 resume')
  })

  it.each([
    ['a file that is not a PDF', '/page.html', /Not a PDF/],
    ['a file over the size limit', '/big.pdf', /too large/],
    ['endless redirects', '/loop', /Too many redirects/],
    ['a slow server', '/slow', /timed out/],
    ['a missing file', '/nope', /HTTP 404/]
  ])('refuses %s', async (_label, path, reason) => {
    await expect(downloadPdf(`${base}${path}`, local)).rejects.toThrow(reason)
  })

  it('checks every redirect again', async () => {
    await expect(downloadPdf(`${base}/to-internal`, { ...local, protocols: ['http:', 'https:'], blockInternal: true }))
      .rejects.toThrow(/internal address/)
  })
})
