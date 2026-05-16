const fs   = require('fs');
const path = require('path');

const bannerFile = path.join(__dirname, 'home-banners.json');

// Không giới hạn số lượng banner
const normalizeBanners = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
};

const readHomeBanners = () => {
    try {
        const raw = fs.readFileSync(bannerFile, 'utf8');
        return normalizeBanners(JSON.parse(raw));
    } catch (error) {
        return [];
    }
};

const writeHomeBanners = (banners) => {
    fs.writeFileSync(
        bannerFile,
        JSON.stringify(normalizeBanners(banners), null, 2),
        'utf8'
    );
};

module.exports = { readHomeBanners, writeHomeBanners, normalizeBanners };
