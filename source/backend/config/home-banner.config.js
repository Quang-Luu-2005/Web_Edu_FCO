const fs = require('fs');
const path = require('path');

const bannerFile = path.join(__dirname, 'home-banners.json');
const bannerCount = 3;

const normalizeBanners = (value) => {
    const items = Array.isArray(value) ? value : [];
    return Array.from({ length: bannerCount }, (_, index) => {
        const image = items[index];
        return typeof image === 'string' ? image.trim() : '';
    });
};

const readHomeBanners = () => {
    try {
        const raw = fs.readFileSync(bannerFile, 'utf8');
        return normalizeBanners(JSON.parse(raw));
    } catch (error) {
        return normalizeBanners([]);
    }
};

const writeHomeBanners = (banners) => {
    fs.writeFileSync(
        bannerFile,
        JSON.stringify(normalizeBanners(banners), null, 2),
        'utf8'
    );
};

module.exports = {
    readHomeBanners,
    writeHomeBanners,
    normalizeBanners
};
