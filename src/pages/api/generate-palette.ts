import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse the incoming request
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from environment
    // Try both import.meta.env and process.env
    const apiKey = import.meta.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY is not set in environment variables');
      console.error('Available env vars:', Object.keys(import.meta.env));
      return new Response(
        JSON.stringify({ error: 'API key not configured. Please add OPENROUTER_API_KEY to your .env file.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Construct the system prompt for the LLM
    const systemPrompt = `You are a color palette generator for SaaS and mobile apps. Return ONLY valid JSON with exactly 7 colors in this exact structure:
{
  "colors": [
    {"role": "Background", "hex": "#000000"},
    {"role": "Surface", "hex": "#000000"},
    {"role": "Primary", "hex": "#000000"},
    {"role": "Secondary", "hex": "#000000"},
    {"role": "Accent", "hex": "#000000"},
    {"role": "Text", "hex": "#000000"},
    {"role": "Subtext", "hex": "#000000"}
  ]
}

Rules:
- All hex codes must be valid 6-digit hex colors (e.g., #FF5733)
- Background should be the main app background color
- Surface is for cards and elevated elements
- Primary is the main brand/action color
- Secondary is for secondary actions
- Accent is for highlights and special elements
- Text is for main text content
- Subtext is for secondary/muted text
- Return ONLY the JSON, no additional text or explanation
- Ensure colors work well together and follow the user's request`;

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ai-color-picker.app',
        'X-Title': 'AI Color Picker Tool',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to generate palette. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Extract the LLM response
    const llmResponse = data.choices?.[0]?.message?.content;
    
    if (!llmResponse) {
      console.error('No content in LLM response:', data);
      return new Response(
        JSON.stringify({ error: 'Invalid response from AI' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response from the LLM
    let paletteData;
    try {
      // Remove any markdown code blocks if present
      const cleanedResponse = llmResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      paletteData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse LLM JSON:', llmResponse);
      return new Response(
        JSON.stringify({ error: 'Failed to parse color data' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate the response structure
    if (!paletteData.colors || !Array.isArray(paletteData.colors) || paletteData.colors.length !== 7) {
      console.error('Invalid palette structure:', paletteData);
      return new Response(
        JSON.stringify({ error: 'Invalid palette structure received' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each color has required fields
    const requiredRoles = ['Background', 'Surface', 'Primary', 'Secondary', 'Accent', 'Text', 'Subtext'];
    const roles = paletteData.colors.map((c: any) => c.role);
    
    for (const role of requiredRoles) {
      if (!roles.includes(role)) {
        console.error('Missing required role:', role);
        return new Response(
          JSON.stringify({ error: 'Incomplete color palette received' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate hex codes
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    for (const color of paletteData.colors) {
      if (!hexRegex.test(color.hex)) {
        console.error('Invalid hex code:', color.hex);
        return new Response(
          JSON.stringify({ error: 'Invalid color format received' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Return the validated palette
    return new Response(
      JSON.stringify(paletteData),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-palette API:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

