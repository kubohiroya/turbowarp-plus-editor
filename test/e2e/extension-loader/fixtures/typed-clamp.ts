declare const INCLUDE_UPPER_BOUND: boolean;
declare const Scratch: {
    BlockType: {REPORTER: string};
    ArgumentType: {NUMBER: string};
    Cast: {toNumber(value: unknown): number};
    extensions: {
        unsandboxed: boolean;
        register(extension: {getInfo(): object; clamp(args: Record<string, unknown>): number}): void;
    };
};

if (Scratch.extensions.unsandboxed) throw new Error('The clamp fixture must run sandboxed.');

Scratch.extensions.register({
    getInfo() {
        const numberArgument = {type: Scratch.ArgumentType.NUMBER, defaultValue: 0};
        return {
            id: 'typedclamp',
            name: 'Typed clamp',
            blocks: [{
                opcode: 'clamp',
                blockType: Scratch.BlockType.REPORTER,
                text: 'clamp [VALUE] to [LOWER] through [UPPER]',
                arguments: {VALUE: numberArgument, LOWER: numberArgument, UPPER: numberArgument}
            }]
        };
    },
    clamp({VALUE, LOWER, UPPER}) {
        const aboveLower = Math.max(Scratch.Cast.toNumber(LOWER), Scratch.Cast.toNumber(VALUE));
        return INCLUDE_UPPER_BOUND ? Math.min(Scratch.Cast.toNumber(UPPER), aboveLower) : aboveLower;
    }
});

export {};
