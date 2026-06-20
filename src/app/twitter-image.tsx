import OpenGraphImage, { runtime, alt, size, contentType } from './opengraph-image';

// Twitter pulls a separate image even when og:image exists; reuse the same
// component so the card on X matches LinkedIn / WhatsApp without a second
// design to maintain.
export { runtime, alt, size, contentType };
export default OpenGraphImage;
