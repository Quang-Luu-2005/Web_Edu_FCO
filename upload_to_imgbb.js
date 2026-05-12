/**
 * Script upload ảnh static lên ImgBB
 * Chạy: node upload_to_imgbb.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Đọc API key từ .env thủ công (không cần dotenv)
const envContent = fs.readFileSync(path.join(__dirname, 'source/backend/.env'), 'utf8');
const apiKeyMatch = envContent.match(/IMGBB_API_KEY=(.+)/);
if (!apiKeyMatch) {
    console.error('Không tìm thấy IMGBB_API_KEY trong .env');
    process.exit(1);
}
const IMGBB_API_KEY = apiKeyMatch[1].trim();

const BASE = path.join(__dirname, 'source/backend');

// Danh sách ảnh cần upload: [tên định danh, đường dẫn file]
const IMAGES = [
    // Static assets
    ['logo',                  'public/logo.png'],
    ['paypal',                'public/paypal.png'],
    ['feature_price',         'public/images/features/price.svg'],
    ['feature_quality',       'public/images/features/quality.svg'],
    ['feature_video',         'public/images/features/video.svg'],

    // Defaults
    ['default_avatar',        'admin/public/avatar/default/avatar.png'],
    ['default_poster',        'admin/public/poster/default/poster.png'],

    // Course posters
    ['poster_graphPython',       'admin/public/poster/graphPython/poster.png'],
    ['poster_beginerAdrDev',     'admin/public/poster/beginerAdrDev/poster.png'],
    ['poster_beginerJvsDev',     'admin/public/poster/beginerJvsDev/poster.png'],
    ['poster_beginerWebDev',     'admin/public/poster/beginerWebDev/poster.png'],
    ['poster_gameDevUnity',      'admin/public/poster/gameDevUnity/poster.png'],
    ['poster_tutCommunication',  'admin/public/poster/tutCommunication/poster.png'],
    ['poster_tutPhotoshop',      'admin/public/poster/tutPhotoshop/poster.png'],
];

// Hàm upload 1 ảnh lên ImgBB qua POST multipart/form-data
function uploadImage(name, filePath) {
    return new Promise((resolve, reject) => {
        const fullPath = path.join(BASE, filePath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`  [SKIP] Không tìm thấy file: ${filePath}`);
            return resolve({ name, url: null, skipped: true });
        }

        const fileData = fs.readFileSync(fullPath);
        const base64 = fileData.toString('base64');

        // Build multipart/form-data thủ công
        const boundary = '----FormBoundary' + Date.now();
        const body = [
            `--${boundary}`,
            `Content-Disposition: form-data; name="key"`,
            '',
            IMGBB_API_KEY,
            `--${boundary}`,
            `Content-Disposition: form-data; name="name"`,
            '',
            name,
            `--${boundary}`,
            `Content-Disposition: form-data; name="image"`,
            '',
            base64,
            `--${boundary}--`,
        ].join('\r\n');

        const bodyBuffer = Buffer.from(body, 'utf8');

        const options = {
            hostname: 'api.imgbb.com',
            path: '/1/upload',
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': bodyBuffer.length,
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success) {
                        resolve({ name, url: json.data.url });
                    } else {
                        reject(new Error(`ImgBB error for ${name}: ${JSON.stringify(json)}`));
                    }
                } catch (e) {
                    reject(new Error(`Parse error for ${name}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(bodyBuffer);
        req.end();
    });
}

// Delay để tránh rate limit
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log(`\nBắt đầu upload ${IMAGES.length} ảnh lên ImgBB...\n`);

    const results = {};
    let success = 0, skipped = 0, failed = 0;

    for (const [name, filePath] of IMAGES) {
        process.stdout.write(`  Uploading [${name}]... `);
        try {
            const result = await uploadImage(name, filePath);
            if (result.skipped) {
                console.log('SKIPPED (file không tồn tại)');
                skipped++;
            } else {
                console.log(`OK → ${result.url}`);
                results[name] = result.url;
                success++;
            }
        } catch (err) {
            console.log(`FAILED: ${err.message}`);
            failed++;
        }
        await delay(500); // 500ms giữa các request
    }

    console.log(`\n✓ Xong: ${success} thành công, ${skipped} bỏ qua, ${failed} lỗi\n`);

    // Ghi kết quả ra file JSON
    const outputPath = path.join(__dirname, 'imgbb_urls.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Đã lưu URLs vào: imgbb_urls.json\n`);

    return results;
}

main().catch(err => {
    console.error('Lỗi:', err);
    process.exit(1);
});
