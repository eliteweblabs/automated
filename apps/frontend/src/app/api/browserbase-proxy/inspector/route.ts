import { NextRequest, NextResponse } from 'next/server';

const BROWSERBASE_URL = 'https://www.browserbase.com';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wss = searchParams.get('wss');
  const navbar = searchParams.get('navbar');

  const targetUrl = new URL('/devtools-fullscreen/inspector.html', BROWSERBASE_URL);
  
  if (wss) {
    targetUrl.searchParams.set('wss', wss);
  }
  if (navbar) {
    targetUrl.searchParams.set('navbar', navbar);
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': request.headers.get('user-agent') || '',
        'Accept': request.headers.get('accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': request.headers.get('accept-language') || 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch from Browserbase: ${response.status}` },
        { status: response.status }
      );
    }

    let html = await response.text();

    html = html.replace(
      /(['"])(https?:)?\/\/www\.browserbase\.com\//g,
      '$1/api/browserbase-proxy/assets/'
    );
    html = html.replace(
      /(['"])\/devtools-fullscreen-compiled\//g,
      '$1/api/browserbase-proxy/assets/devtools-fullscreen-compiled/'
    );
    html = html.replace(
      /(['"])\/devtools-fullscreen\//g,
      '$1/api/browserbase-proxy/assets/devtools-fullscreen/'
    );
    html = html.replace(
      /(['"])\.\/([^'"]+)/g,
      '$1/api/browserbase-proxy/assets/devtools-fullscreen/$2'
    );

    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return new NextResponse(html, { headers });
  } catch (error) {
    console.error('Browserbase proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request to Browserbase' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
