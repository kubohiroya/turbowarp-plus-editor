// Initial native identities are captured once, after the host's known startup field patch settles.
const afterNativeFieldStartup = (ready, attach, isDisposed, onError) => {
    const start = fixedInputs => {
        if (isDisposed()) return;
        try {
            attach(fixedInputs);
        } catch (error) {
            onError(error);
        }
    };
    return Promise.resolve(ready).then(() => start(true), error => {
        if (isDisposed()) return;
        onError(error);
        // A failed fixed capability must not remove the existing SOURCE or hierarchy editors.
        start(false);
    });
};

export default afterNativeFieldStartup;
