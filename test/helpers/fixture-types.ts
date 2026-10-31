// Expected syntax shape for the authored mapping fixtures used in workspace checks.
export interface FixtureYamlMapping {
    kind: 'map';
    entries: Array<{
        kind: 'pair';
        key: {value: string};
        value: {value?: unknown; items?: Array<{value: unknown}>};
    }>;
}
