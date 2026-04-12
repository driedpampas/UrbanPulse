const MIN_RESOURCE_TOKEN_LENGTH = 3;

export function normalizeResourceText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function toResourceTokens(value: string): string[] {
    const normalized = normalizeResourceText(value);
    if (!normalized) {
        return [];
    }

    const tokens = new Set<string>([normalized]);
    for (const token of normalized.split(' ')) {
        if (token.length >= MIN_RESOURCE_TOKEN_LENGTH) {
            tokens.add(token);
        }
    }

    return Array.from(tokens);
}

export function buildResourceTokenSet(values: string[]): Set<string> {
    const tokens = new Set<string>();
    for (const value of values) {
        for (const token of toResourceTokens(value)) {
            tokens.add(token);
        }
    }
    return tokens;
}

function levenshteinDistance(left: string, right: string): number {
    if (left === right) {
        return 0;
    }

    const leftLength = left.length;
    const rightLength = right.length;

    if (leftLength === 0) {
        return rightLength;
    }

    if (rightLength === 0) {
        return leftLength;
    }

    const matrix = Array.from({ length: leftLength + 1 }, () =>
        new Array<number>(rightLength + 1).fill(0)
    );

    for (let i = 0; i <= leftLength; i += 1) {
        matrix[i]![0] = i;
    }

    for (let j = 0; j <= rightLength; j += 1) {
        matrix[0]![j] = j;
    }

    for (let i = 1; i <= leftLength; i += 1) {
        for (let j = 1; j <= rightLength; j += 1) {
            const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
            matrix[i]![j] = Math.min(
                matrix[i - 1]![j]! + 1,
                matrix[i]![j - 1]! + 1,
                matrix[i - 1]![j - 1]! + substitutionCost
            );
        }
    }

    return matrix[leftLength]![rightLength]!;
}

function similarity(left: string, right: string): number {
    const maxLength = Math.max(left.length, right.length);
    if (maxLength === 0) {
        return 1;
    }

    const distance = levenshteinDistance(left, right);
    return 1 - distance / maxLength;
}

function tokensMatch(needle: string, candidate: string): boolean {
    if (!needle || !candidate) {
        return false;
    }

    if (needle === candidate) {
        return true;
    }

    if (needle.length >= MIN_RESOURCE_TOKEN_LENGTH && candidate.includes(needle)) {
        return true;
    }

    if (candidate.length >= MIN_RESOURCE_TOKEN_LENGTH && needle.includes(candidate)) {
        return true;
    }

    return similarity(needle, candidate) >= 0.75;
}

export function findMatchedRequestedResources(
    requestedResources: string[],
    userResourceTokens: Set<string>
): string[] {
    if (requestedResources.length === 0 || userResourceTokens.size === 0) {
        return [];
    }

    const matched = new Set<string>();
    const candidateTokens = Array.from(userResourceTokens);

    for (const requestedResource of requestedResources) {
        const normalizedRequested = normalizeResourceText(requestedResource);
        if (!normalizedRequested) {
            continue;
        }

        const requestedTokens = toResourceTokens(requestedResource);
        const hasMatch = requestedTokens.some((requestedToken) =>
            candidateTokens.some((candidateToken) => tokensMatch(requestedToken, candidateToken))
        );

        if (hasMatch) {
            matched.add(normalizedRequested);
        }
    }

    return Array.from(matched);
}
