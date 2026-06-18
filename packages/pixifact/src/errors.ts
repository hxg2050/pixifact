export function hintForCommandError(error: string) {
    if (error.includes('inside projectRoot')) {
        return 'Use a project-relative scene path that stays inside projectRoot.';
    }
    if (error.includes('already exists')) {
        return 'Choose a different scene path or inspect the existing file before writing.';
    }
    if (error.includes('Unknown template kind')) {
        return 'Use one of: button, progressBar, scrollView, loginForm.';
    }
    if (error.includes('was not found')) {
        return 'Re-run scene get or node inspect to refresh locators before regenerating the command.';
    }
    if (error.includes('Only container nodes')) {
        return 'Choose a container node as the parent, or create a container template before adding children.';
    }
    if (error.includes('does not exist')) {
        return 'Verify that the field belongs to the target node or component schema before retrying.';
    }
    if (error.includes('expects')) {
        return 'Check the target schema and send a value with the expected type.';
    }
    return undefined;
}
