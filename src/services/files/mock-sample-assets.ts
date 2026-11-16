// Bundled sample files of the mock FileService (built by scripts/build-mock-files.mjs). Metro turns
// each `require` into an asset module; the DOCX is not an asset type Metro knows, so it travels as
// base64 in `generated/mock-docx.ts`.
import type { MockSampleKey } from './mock-samples';

type AssetModule = number;

export const MOCK_SAMPLE_MODULES: Record<Exclude<MockSampleKey, 'docx'>, AssetModule> = {
  pdfLong: require('../../../assets/mock-files/theory-12-pages.pdf'),
  pdfShort: require('../../../assets/mock-files/homework-1-page.pdf'),
  cheatsheet: require('../../../assets/mock-files/cheatsheet.jpg'),
  photo1: require('../../../assets/mock-files/photo-1.jpg'),
  photo2: require('../../../assets/mock-files/photo-2.jpg'),
  photo3: require('../../../assets/mock-files/photo-3.jpg'),
  photo4: require('../../../assets/mock-files/photo-4.jpg'),
  photo5: require('../../../assets/mock-files/photo-5.jpg'),
  photo6: require('../../../assets/mock-files/photo-6.jpg'),
  photo7: require('../../../assets/mock-files/photo-7.jpg'),
  photo8: require('../../../assets/mock-files/photo-8.jpg'),
  photo1Thumb: require('../../../assets/mock-files/photo-1-thumb.jpg'),
  photo2Thumb: require('../../../assets/mock-files/photo-2-thumb.jpg'),
  photo3Thumb: require('../../../assets/mock-files/photo-3-thumb.jpg'),
  photo4Thumb: require('../../../assets/mock-files/photo-4-thumb.jpg'),
  photo5Thumb: require('../../../assets/mock-files/photo-5-thumb.jpg'),
  photo6Thumb: require('../../../assets/mock-files/photo-6-thumb.jpg'),
  photo7Thumb: require('../../../assets/mock-files/photo-7-thumb.jpg'),
  photo8Thumb: require('../../../assets/mock-files/photo-8-thumb.jpg'),
};
