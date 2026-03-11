import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

type UploadFileOptions = {
    path?: string;
};

export async function uploadFile(file: Blob | File, bucketName: string, options?: UploadFileOptions): Promise<string> {
    const fileNameStr = file instanceof File ? file.name : 'blob_upload';
    const isSvg = file.type === 'image/svg+xml' || fileNameStr.toLowerCase().endsWith('.svg');
    const ext = isSvg ? 'svg' : (fileNameStr.split('.').pop() || 'webp');
    const generatedFileName = `${Date.now()}_${uuidv4().substring(0, 8)}.${ext}`;
    const filePath = options?.path
        ? options.path.replace(/^\/+/, '').replace(/\\/g, '/')
        : generatedFileName;

    const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
            upsert: false,
            contentType: file.type || undefined,
        });

    if (error) {
        console.error('Failed to upload file to supabase:', error);
        throw new Error(error.message || 'Falha no upload para o Supabase');
    }

    // Return the public URL for the newly uploaded file
    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(data.path);
    return publicUrlData.publicUrl;
}

export async function deleteFile(url: string): Promise<void> {
    if (!url) return;

    // Local uploads (legacy)
    if (url.startsWith('/uploads/')) return;

    try {
        const urlObj = new URL(url);
        // Supabase URL extract: /storage/v1/object/public/bucketName/fileName
        const match = urlObj.pathname.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);

        if (match) {
            const bucket = match[1];
            const path = decodeURIComponent(match[2]);

            const { error } = await supabase.storage.from(bucket).remove([path]);
            if (error) {
                console.error('Falha ao excluir arquivo do Supabase:', error.message);
            }
        }
    } catch (e) {
        console.error('Falha ao processar URL para exclusão:', e);
    }
}
