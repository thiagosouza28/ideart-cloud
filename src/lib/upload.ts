export async function uploadFile(file: Blob | File, targetDir: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetDir', targetDir);

    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Falha no upload');
    }

    const data = await response.json();
    return data.url;
}

export async function deleteFile(url: string): Promise<void> {
    if (!url || !url.startsWith('/uploads/')) return;

    const response = await fetch('/api/upload', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Falha ao excluir arquivo:', error.error);
    }
}
