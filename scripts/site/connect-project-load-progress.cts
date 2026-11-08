const message = `                    <div
                        className={styles.message}
                        ref={this.messageRef}
                    />`;

module.exports = (source: string) => {
    if (!source.includes(message)) throw new Error('The pinned GUI loading message has changed');
    return `import {ProjectLoadProgress} from '@kubohiroya/turbowarp-plus-editor-ui/project-load-progress-view';\n` +
        source.replace(message, `                    <div className={styles.message}>
                        <ProjectLoadProgress vm={this.props.vm} locale={this.props.intl.locale}>
                            <span ref={this.messageRef} />
                        </ProjectLoadProgress>
                    </div>`);
};
