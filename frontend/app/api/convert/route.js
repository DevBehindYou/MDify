import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Resolved at build time from env — set BACKEND_URL on Render.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(request) {
  try {
    const formData = await request.formData();

    const response = await fetch(`${BACKEND_URL}/convert`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || 'Conversion failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const isConnectionError =
      error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED';

    return NextResponse.json(
      {
        error: isConnectionError
          ? 'Backend server is not reachable. Check BACKEND_URL environment variable.'
          : `Server error: ${error.message}`,
      },
      { status: 503 }
    );
  }
}
