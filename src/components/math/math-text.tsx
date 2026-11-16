// Fast path (docs/spec/09-data-i18n-math.md §4.3 step 2): a statement without a single formula is laid
// out with native text — no WebView. Paragraphs and item rows use the same metrics as the HTML renderer.
import { Text as RNText, View } from 'react-native';

import { makeStyles } from '@/theme';

import {
  MATH_BLOCK_GAP,
  MATH_FONT_SIZE,
  MATH_ITEM_GAP_X,
  MATH_ITEM_GAP_Y,
  MATH_ITEM_PADDING_Y,
  MATH_LINE_HEIGHT,
  MATH_MAX_FONT_SCALE,
  MATH_NODE_GAP,
} from './math-metrics';
import { inlineText, type MathBlock } from './parse-math-content';

export type MathTextProps = {
  blocks: MathBlock[];
  /** Line clamp; exact (with an ellipsis) for a single paragraph, a height limit otherwise. */
  maxLines?: number;
  /** Height limit in px that goes with `maxLines`. */
  maxHeight: number | null;
  accessibilityLabel: string;
  testID?: string;
};

export function MathText({ blocks, maxLines, maxHeight, accessibilityLabel, testID }: MathTextProps) {
  const styles = useStyles();
  const only = blocks.length === 1 && blocks[0].nodes.length === 1 ? blocks[0].nodes[0] : null;

  // The common case — one paragraph of prose — clamps like any text, with an ellipsis.
  if (only && only.type === 'paragraph') {
    return (
      <RNText
        maxFontSizeMultiplier={MATH_MAX_FONT_SCALE}
        numberOfLines={maxLines}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={styles.text}
      >
        {inlineText(only.inline)}
      </RNText>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.blocks, maxHeight === null ? null : { maxHeight, overflow: 'hidden' }]}
    >
      {blocks.map((block, blockIndex) => (
        <View key={blockIndex} style={styles.block}>
          {block.nodes.map((node, nodeIndex) => {
            if (node.type === 'paragraph') {
              return (
                <RNText key={nodeIndex} maxFontSizeMultiplier={MATH_MAX_FONT_SCALE} style={styles.text}>
                  {inlineText(node.inline)}
                </RNText>
              );
            }
            if (node.type === 'items') {
              return (
                <View key={nodeIndex} style={styles.row}>
                  {node.items.map((item, itemIndex) => (
                    <RNText
                      key={itemIndex}
                      maxFontSizeMultiplier={MATH_MAX_FONT_SCALE}
                      style={[styles.text, styles.item]}
                    >
                      {inlineText(item)}
                    </RNText>
                  ))}
                </View>
              );
            }
            // Display nodes are math by definition and never reach the fast path.
            return null;
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  blocks: { gap: MATH_BLOCK_GAP, alignSelf: 'stretch' },
  block: { gap: MATH_NODE_GAP },
  text: {
    fontFamily: t.fonts.regular,
    fontSize: MATH_FONT_SIZE,
    lineHeight: MATH_LINE_HEIGHT,
    color: t.colors.label,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: MATH_ITEM_GAP_X,
    rowGap: MATH_ITEM_GAP_Y,
  },
  item: { maxWidth: '100%', paddingVertical: MATH_ITEM_PADDING_Y },
}));
