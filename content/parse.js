import { nonNull } from '../util.js';
import { jsxCreateElement } from '../jsx.js';
import { onWordHoverStart, onWordHoverStop } from './content.js';
export function displayCategory(node) {
    if (node instanceof Text || node instanceof CDATASection) {
        return 'text';
    } else if (node instanceof Element) {
        const display = getComputedStyle(node).display.split(/\s/g);
        if (display[0] === 'none') return 'none';
        // NOTE Workaround for Chrome not supporting multi-value display and display: ruby
        if (node.tagName === 'RUBY') return 'ruby';
        if (node.tagName === 'RP') return 'none';
        if (node.tagName === 'RT') return 'ruby-text';
        if (node.tagName === 'RB') return 'inline';
        // Not sure how `inline list-item` or `list-item inline` should behave
        // These are roughly ordered by the frequency I expect them to show up
        if (display.some(x => x.startsWith('block'))) return 'block';
        if (display.some(x => x.startsWith('inline'))) return 'inline';
        if (display[0] === 'flex') return 'block';
        if (display[0] === '-webkit-box') return 'block'; // Old name of flex? Still used on Google Search for some reason.
        if (display[0] === 'grid') return 'block';
        if (display[0].startsWith('table')) return 'block';
        if (display[0].startsWith('flow')) return 'block';
        if (display[0] === 'ruby') return 'ruby';
        if (display[0].startsWith('ruby-text')) return 'ruby-text';
        if (display[0].startsWith('ruby-base')) return 'inline';
        if (display[0].startsWith('math')) return 'inline';
        if (display.includes('list-item')) return 'block';
        // Questionable
        if (display[0] === 'contents') return 'inline';
        if (display[0] === 'run-in') return 'block';
        alert(`Warning: Unknown display value ${display.join(' ')}, please report this!`);
        return 'none';
    } else {
        return 'none';
    }
}
function splitFragment(fragments, fragmentIndex, splitOffset) {
    const oldFragment = fragments[fragmentIndex];
    // console.log('Splitting fragment', oldFragment);
    const newNode = oldFragment.node.splitText(splitOffset - oldFragment.start);
    // Insert new fragment
    const newFragment = {
        start: splitOffset,
        end: oldFragment.end,
        length: oldFragment.end - splitOffset,
        node: newNode,
        hasRuby: oldFragment.hasRuby,
    };
    fragments.splice(fragmentIndex + 1, 0, newFragment);
    // Change endpoint of existing fragment accordingly
    oldFragment.end = splitOffset;
    oldFragment.length = splitOffset - oldFragment.start;
}
function insertBefore(newNode, referenceNode) {
    nonNull(referenceNode.parentElement).insertBefore(newNode, referenceNode);
}
function insertAfter(newNode, referenceNode) {
    const parent = nonNull(referenceNode.parentElement);
    const sibling = referenceNode.nextSibling;
    if (sibling) {
        parent.insertBefore(newNode, sibling);
    } else {
        parent.appendChild(newNode);
    }
}
function wrap(node, wrapper) {
    insertBefore(wrapper, node);
    wrapper.append(node);
}
export const reverseIndex = new Map();
export function applyTokens(fragments, tokens) {
    // console.log('Applying results:', fragments, tokens);
    let fragmentIndex = 0;
    let curOffset = 0;
    let fragment = fragments[fragmentIndex];
    const text = fragments.map(x => x.node.data).join('');
    for (const token of tokens) {
        if (!fragment) return;
        // console.log('at', curOffset, 'fragment', fragment, 'token', token);
        // Wrap all unparsed fragments that appear before the token
        while (curOffset < token.start) {
            if (fragment.end > token.start) {
                // Only the beginning of the node is unparsed. Split it.
                splitFragment(fragments, fragmentIndex, token.start);
            }
            // console.log('Unparsed original:', fragment.node.data);
            wrap(fragment.node, jsxCreateElement('span', { class: 'jpdb-word unparsed' }));
            curOffset += fragment.length;
            fragment = fragments[++fragmentIndex];
            if (!fragment) return;
        }
        // Accumulate fragments until we have enough to fit the current token
        while (curOffset < token.end) {
            if (fragment.end > token.end) {
                // Only the beginning of the node is part of the token. Split it.
                splitFragment(fragments, fragmentIndex, token.end);
            }
            // console.log('Part of token:', fragment.node.data);
            const className = `jpdb-word ${token.card.state.join(' ')}`;
            const wrapper =
                token.rubies.length > 0 && !fragment.hasRuby
                    ? jsxCreateElement('ruby', {
                          class: className,
                          onmouseenter: onWordHoverStart,
                          onmouseleave: onWordHoverStop,
                      })
                    : jsxCreateElement('span', {
                          class: className,
                          onmouseenter: onWordHoverStart,
                          onmouseleave: onWordHoverStop,
                      });
            const idx = reverseIndex.get(`${token.card.vid}/${token.card.sid}`);
            if (idx === undefined) {
                reverseIndex.set(`${token.card.vid}/${token.card.sid}`, { className, elements: [wrapper] });
            } else {
                idx.elements.push(wrapper);
            }
            wrapper.jpdbData = {
                token,
                context: text,
                contextOffset: curOffset,
            };
            wrap(fragment.node, wrapper);
            if (!fragment.hasRuby) {
                for (const ruby of token.rubies) {
                    if (ruby.start >= fragment.start && ruby.end <= fragment.end) {
                        // Ruby is contained in fragment
                        if (ruby.start > fragment.start) {
                            splitFragment(fragments, fragmentIndex, ruby.start);
                            insertAfter(jsxCreateElement('rt', null), fragment.node);
                            fragment = fragment = fragments[++fragmentIndex];
                        }
                        if (ruby.end < fragment.end) {
                            splitFragment(fragments, fragmentIndex, ruby.end);
                            insertAfter(jsxCreateElement('rt', { class: 'jpdb-furi' }, ruby.text), fragment.node);
                            fragment = fragment = fragments[++fragmentIndex];
                        } else {
                            insertAfter(jsxCreateElement('rt', { class: 'jpdb-furi' }, ruby.text), fragment.node);
                        }
                    }
                }
            }
            curOffset = fragment.end;
            fragment = fragments[++fragmentIndex];
            if (!fragment) break;
        }
    }
    // Wrap any left-over fragments in unparsed wrappers
    for (const fragment of fragments.slice(fragmentIndex)) {
        // console.log('Unparsed original:', fragment.node.data);
        wrap(fragment.node, jsxCreateElement('span', { class: 'jpdb-word unparsed' }));
    }
}
