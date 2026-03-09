import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure directories exist
const directories = [
    'uploads/produtos',
    'uploads/insumos',
    'uploads/logos',
    'uploads/usuarios',
    'uploads/clientes',
    'uploads/pedidos',
    'uploads/empresa'
];

directories.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// Multer storage configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for larger files
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|svg|pdf|doc|docx|xls|xlsx|zip|rar|cdr|ai|psd/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = /image\/|application\/pdf|application\/zip|application\/x-rar-compressed|application\/msword|application\/vnd.openxmlformats-officedocument|application\/vnd.ms-excel|application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet|application\/postscript|application\/x-cdr/;
        const isMimeOk = mimetype.test(file.mimetype);

        if (extname) {
            return cb(null, true);
        }
        cb(new Error('Tipo de arquivo não permitido.'));
    }
});

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        console.log('Upload request received:', {
            file: req.file ? req.file.originalname : 'none',
            body: req.body
        });

        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        const { targetDir } = req.body; // e.g., 'produtos', 'insumos'
        if (!targetDir) {
            return res.status(400).json({ error: 'Diretório de destino não informado.' });
        }

        const allowedDirs = ['produtos', 'insumos', 'logos', 'usuarios', 'clientes', 'pedidos', 'empresa'];
        const safeTargetDir = targetDir.replace(/[^a-z0-9]/gi, '');

        if (!allowedDirs.includes(safeTargetDir)) {
            return res.status(400).json({ error: 'Diretório de destino inválido.' });
        }

        const isSvg = req.file.mimetype === 'image/svg+xml' || req.file.originalname.toLowerCase().endsWith('.svg');
        const ext = isSvg ? 'svg' : 'webp';
        const fileName = `${safeTargetDir}_${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;
        const outputPath = path.join(__dirname, 'uploads', safeTargetDir, fileName);

        console.log('Saving file to:', outputPath);

        let finalBuffer = req.file.buffer;

        if (!isSvg) {
            finalBuffer = await sharp(req.file.buffer)
                .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();
        }

        fs.writeFileSync(outputPath, finalBuffer);

        res.json({
            url: `/uploads/${safeTargetDir}/${fileName}`,
            success: true
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Falha no processamento da imagem.' });
    }
});

// Delete endpoint
app.delete('/api/upload', (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !url.startsWith('/uploads/')) {
            return res.status(400).json({ error: 'URL inválida.' });
        }

        // Sanitize path to prevent directory traversal
        const normalizedUrl = path.normalize(url).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(__dirname, normalizedUrl);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return res.json({ success: true });
        }
        res.status(404).json({ error: 'Arquivo não encontrado.' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Falha ao excluir arquivo.' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Erro no upload: ${err.message}` });
    }
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
