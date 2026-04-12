import { expect, test } from 'bun:test';
import { buildResourceTokenSet, findMatchedRequestedResources } from './resourceMatching';

test('matches exact and token-overlap resources', () => {
    const tokens = buildResourceTokenSet(['Water Pump', 'Generator cable']);
    const matched = findMatchedRequestedResources(['water', 'cable'], tokens);

    expect(matched).toContain('water');
    expect(matched).toContain('cable');
});

test('matches moderately similar resources by fuzzy similarity', () => {
    const tokens = buildResourceTokenSet(['electrician', 'flashlight']);
    const matched = findMatchedRequestedResources(['electrcian'], tokens);

    expect(matched).toEqual(['electrcian']);
});

test('does not match unrelated resources', () => {
    const tokens = buildResourceTokenSet(['first aid kit', 'blanket']);
    const matched = findMatchedRequestedResources(['diesel fuel'], tokens);

    expect(matched).toHaveLength(0);
});
