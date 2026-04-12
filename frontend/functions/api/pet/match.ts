interface PetPulse {
    id: string;
    content: string;
    type: string;
    lat: number;
    lng: number;
    timestamp: number;
}

interface MatchRequest {
    source: PetPulse;
    candidates: PetPulse[];
}

interface AiMatch {
    id: string;
    confidence: number;
    reason: string;
}

export const onRequestPost = async (context: { request: Request; env: { AI: any } }) => {
    const { request, env } = context;

    if (!env.AI) {
        return new Response(JSON.stringify({ error: 'AI binding not found' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = (await request.json()) as MatchRequest;
        const { source, candidates } = body;

        if (!source || !candidates || candidates.length === 0) {
            return Response.json({ matches: [] });
        }

        const messages = [
            {
                role: 'system',
                content:
                    'You are the UrbanPulse Pet Guardian AI. Your goal is to identify if a "Found" pet report matches a "Lost" pet report based on physical descriptions. Return matches with a confidence score of 70-100%.',
            },
            {
                role: 'user',
                content: `
SOURCE PET REPORT:
ID: ${source.id}
Content: ${source.content}

CANDIDATE REPORTS:
${candidates.map((c) => `ID: ${c.id}\nContent: ${c.content}\n---`).join('\n')}

Identify matches where the physical description (species, breed, colors, size, markings) suggests it is the same animal.
`,
            },
        ];

        const response = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
            messages,
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'pet_matches',
                    schema: {
                        type: 'object',
                        properties: {
                            matches: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: {
                                            type: 'string',
                                            description: 'The ID of the candidate pet',
                                        },
                                        confidence: {
                                            type: 'number',
                                            description: '0-100 match confidence',
                                        },
                                        reason: {
                                            type: 'string',
                                            description: 'Brief reasoning for the match',
                                        },
                                    },
                                    required: ['id', 'confidence', 'reason'],
                                },
                            },
                        },
                        required: ['matches'],
                    },
                },
            },
        });

        // Filter by 70% threshold as per user request
        if (response && typeof response === 'object' && 'matches' in response) {
            const filteredMatches = (response.matches as AiMatch[]).filter(
                (m) => m.confidence >= 70
            );
            return Response.json({ matches: filteredMatches });
        }

        return Response.json({ matches: [] });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
