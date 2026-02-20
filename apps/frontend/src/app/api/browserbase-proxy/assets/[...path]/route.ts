import { NextRequest, NextResponse } from 'next/server';

const BROWSERBASE_URL = 'https://www.browserbase.com';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getMimeType(path: string): string {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const assetPath = path.join('/');
  const targetUrl = new URL(`/${assetPath}`, BROWSERBASE_URL);

  const searchParams = request.nextUrl.searchParams.toString();
  if (searchParams) {
    targetUrl.search = searchParams;
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'Accept': request.headers.get('accept') || '*/*',
        'Accept-Language': request.headers.get('accept-language') || 'en-US,en;q=0.5',
        'Referer': BROWSERBASE_URL,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch asset: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || getMimeType(assetPath);
    const isTextContent = contentType.includes('text/') ||
      contentType.includes('javascript') ||
      contentType.includes('json') ||
      contentType.includes('xml');

    let body: ArrayBuffer | string;

    if (isTextContent) {
      let text = await response.text();
      text = text.replace(
        /(['"])(https?:)?\/\/www\.browserbase\.com\//g,
        '$1/api/browserbase-proxy/assets/'
      );
      text = text.replace(
        /(['"])\/devtools-fullscreen-compiled\//g,
        '$1/api/browserbase-proxy/assets/devtools-fullscreen-compiled/'
      );
      text = text.replace(
        /(['"])\/devtools-fullscreen\//g,
        '$1/api/browserbase-proxy/assets/devtools-fullscreen/'
      );
      body = text;
    } else {
      body = await response.arrayBuffer();
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new NextResponse(body, { headers });
  } catch (error) {
    console.error('Browserbase asset proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy asset request' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
