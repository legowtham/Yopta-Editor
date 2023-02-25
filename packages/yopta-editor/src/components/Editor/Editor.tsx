import { Editor, Transforms, Range, Element, NodeEntry, createEditor } from 'slate';
import React, { useCallback, KeyboardEvent, MouseEvent, useMemo, ReactElement } from 'react';
import cx from 'classnames';
import { DefaultElement, Editable, ReactEditor, RenderElementProps } from 'slate-react';
import { TextLeaf } from './TextLeaf/TextLeaf';
// import { RenderElement } from './RenderElement/RenderElement';
import { Toolbar } from './Toolbar/Toolbar';
import { capitalizeFirstLetter, getDefaultParagraphLine, getNodeByPath, removeMarks } from './utils';
import { ELEMENT_TYPES_MAP, TEXT_ELEMENTS_LIST } from './constants';
import { SuggestionElementList } from './SuggestionElementList/SuggestionElementList';
import { useScrollToElement } from '../../hooks/useScrollToElement';
import { useActionMenuContext, SUGGESTION_TRIGGER } from '../../contexts/ActionMenuContext/ActionMenuContext';
import { LibOptions, useSettings } from '../../contexts/SettingsContext/SettingsContext';
import { useNodeSettingsContext } from '../../contexts/NodeSettingsContext/NodeSettingsContext';
import { OutsideClick } from '../OutsideClick';
import { createListPlugin } from '../../plugins/list';
import { createLinkPlugin } from '../../plugins/link';
import { onCopyYoptaNodes } from '../../utils';
import s from './Editor.module.scss';
import { ElementHover } from '../HoveredMenu/HoveredMenu';
import { HOTKEYS } from '../../utils/hotkeys';
import { YoptaComponent } from '../../utils/component';

type YoptaProps = { editor: Editor; placeholder: LibOptions['placeholder']; components: YoptaComponent[] };

const EditorYopta = ({ editor, placeholder, components }: YoptaProps) => {
  const { options } = useSettings();
  useScrollToElement();
  const [{ disableWhileDrag }, { changeHoveredNode }] = useNodeSettingsContext();

  const {
    toolbarRef,
    toolbarStyle,
    selectedElement,
    hideToolbarTools,
    suggestionListRef,
    showSuggestionList,
    hideSuggestionList,
    filterSuggestionList,
    suggesstionListStyle,
    isSuggesstionListOpen,
    onChangeSuggestionFilterText,
    changeNodeType,
  } = useActionMenuContext();

  const isReadOnly = disableWhileDrag;

  const renderElement = useMemo(() => {
    return (props: RenderElementProps) => {
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        const renderFn = component.renderer(editor);
        const isInline = component.element?.type === 'inline';

        if (typeof renderFn === 'function' && props.element.type === component.type) {
          return (
            <ElementHover
              element={props.element}
              attributes={props.attributes}
              hideSettings={false}
              isInlineNode={isInline}
              renderElement={() => renderFn(props)}
            >
              {props.children}
            </ElementHover>
          );
        }
      }
      return <DefaultElement {...props} />;
    };
  }, [components, editor]);

  const decorate = useMemo(() => {
    return (nodeEntry: NodeEntry) => {
      let ranges: Range[] = [];
      const [node] = nodeEntry;

      for (let index = 0; index < components.length; index++) {
        const component = components[index];
        const decoratorFn = component.decorator;

        if (typeof decoratorFn === 'function' && Element.isElement(node) && node.type === component.type) {
          ranges.push(...decoratorFn(editor)(nodeEntry));
        }
      }

      return ranges;
    };
  }, [components, editor]);

  const eventHandlers = useMemo(() => {
    const events = components.map((component) => Object.keys(component.handlers || {})).flat();
    const eventHandlersMap = {};
    const handlersOptions = { hotkeys: HOTKEYS, defaultComponent: getDefaultParagraphLine() };

    events.forEach((eventType) => {
      eventHandlersMap[eventType] = function (event) {
        components.forEach((component) => {
          if (component.handlers && Object.keys(component.handlers).length > 0) {
            component.handlers[eventType](editor, handlersOptions)(event);
          }
        });
      };
    });

    return eventHandlersMap;
  }, [components, editor]);

  const renderLeaf = useCallback((leafProps) => {
    const nodePlaceholder =
      leafProps.children.props?.parent.type === ELEMENT_TYPES_MAP.paragraph
        ? placeholder || ' Type / to open menu'
        : ` ${capitalizeFirstLetter(leafProps.children.props?.parent.type)}`;

    return <TextLeaf placeholder={nodePlaceholder} {...leafProps} />;
  }, []);

  const { ListPlugin, LinkPlugin } = useMemo(
    () => ({
      ListPlugin: createListPlugin(editor),
      LinkPlugin: createLinkPlugin(editor),
    }),
    [],
  );

  const onKeyUp = useCallback(
    (event) => {
      if (!editor.selection) return;
      const text = Editor.string(editor, editor.selection.anchor.path);

      // [TODO] - make trigger not only empty paragraph
      if (!isSuggesstionListOpen && event.key === SUGGESTION_TRIGGER && text === SUGGESTION_TRIGGER) {
        showSuggestionList(undefined, { triggeredBySuggestion: true });
      }

      if (isSuggesstionListOpen) {
        onChangeSuggestionFilterText(text);
      }
    },
    [isSuggesstionListOpen],
  );

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const { selection } = editor;
    if (!selection) return;

    const currentNode: any = getNodeByPath(editor);
    const isListItemNode = currentNode.type === ELEMENT_TYPES_MAP['list-item'];
    const isLastDeleted = editor.children.length === 1;

    const isVoidNode = Editor.isVoid(editor, currentNode);
    const isTextNode = TEXT_ELEMENTS_LIST.includes(currentNode.type);

    const text = Editor.string(editor, selection.anchor.path);
    const isEnter = event.key === 'Enter';
    const isBackspace = event.key === 'Backspace';
    const isSpace = event.code === 'Space';

    if (event.key === 'Meta' || (event.key === 'Backspace' && (text.length === 0 || text === SUGGESTION_TRIGGER))) {
      hideSuggestionList();
    }

    if (isBackspace && isVoidNode && isLastDeleted) {
      event.preventDefault();
      const lineParagraph = getDefaultParagraphLine();

      Transforms.setNodes(editor, lineParagraph, {
        mode: 'lowest',
        at: [0, 0],
        match: (n) => Editor.isEditor(editor) && Element.isElement(n),
      });

      const focusTimeout = setTimeout(() => {
        Transforms.select(editor, { path: [0, 0], offset: 0 });
        ReactEditor.focus(editor);

        clearTimeout(focusTimeout);
      }, 0);

      return;
    }

    // [TODO] - rewrite after monorepo. Each element should have only event handlers: onKeyDown, onKeyUp etc.
    if (isEnter && currentNode.type === ELEMENT_TYPES_MAP.link) {
      LinkPlugin.handlers.onEnter(event);
      return;
    }

    if (isSpace && currentNode.type === ELEMENT_TYPES_MAP.link) {
      LinkPlugin.handlers.onSpace(event);
      return;
    }

    if (isBackspace && isListItemNode) {
      ListPlugin.handlers.onBackspace(event);
      return;
    }

    if (isEnter && isListItemNode) {
      ListPlugin.handlers.onEnter(event);
      return;
    }

    if (isEnter) {
      const lineParagraph = getDefaultParagraphLine();

      if (event.shiftKey) {
        event.preventDefault();
        editor.insertText('\n');
      }

      if (!event.shiftKey) {
        if (isTextNode) {
          // [TODO] - change next element to paragraph
          event.preventDefault();

          Transforms.splitNodes(editor, { always: true });
          Transforms.setNodes(editor, lineParagraph);
          removeMarks(editor);
          // [TODO] - add new line in case of void element (e.g. image)
        } else if (isVoidNode) {
          event.preventDefault();
          Transforms.insertNodes(editor, lineParagraph);
        }

        changeHoveredNode(lineParagraph);
      }
    }
  }, []);

  // const decorate = useCallback(([node, path]) => {
  //   if (Element.isElement(node)) {
  //     const decorateFn = decorators[node.type];

  //     if (decorateFn) return decorateFn([node, path]);
  //   }

  //   if (editor.selection) {
  //     if (
  //       !Editor.isEditor(node) &&
  //       Editor.string(editor, [path[0]]) === '' &&
  //       Range.includes(editor.selection, path) &&
  //       Range.isCollapsed(editor.selection)
  //     ) {
  //       return [
  //         {
  //           ...editor.selection,
  //           placeholder: true,
  //         },
  //       ];
  //     }
  //   }
  //   return [];
  // }, []);

  const handleEmptyZoneClick = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (e.currentTarget !== e.target || !editor.selection) return;

    Editor.withoutNormalizing(editor, () => {
      const lastPath = [editor.children.length - 1, 0];
      const lastNode: any = getNodeByPath(editor, lastPath, 'highest');
      const lastNodeText = Editor.string(editor, lastPath);

      const location = {
        anchor: { path: lastPath, offset: 0 },
        focus: { path: lastPath, offset: 0 },
      };

      if (lastNode.type === ELEMENT_TYPES_MAP.paragraph && lastNodeText.length === 0) {
        Transforms.select(editor, {
          path: location.anchor.path,
          offset: 0,
        });

        changeHoveredNode(lastNode);
        return ReactEditor.focus(editor);
      }

      const lineParagraph = getDefaultParagraphLine();
      changeHoveredNode(lineParagraph);

      Transforms.insertNodes(editor, lineParagraph, {
        at: [editor.children.length],
        select: true,
      });
      ReactEditor.focus(editor);
    });
  };

  const stopPropagation = (e: any) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  return (
    <main
      id="yopta-editor"
      aria-hidden
      className={cx(s.editorContainer, options.className)}
      onMouseDown={handleEmptyZoneClick}
    >
      <div id="yopta-editor-content" className={s.editorContent} aria-hidden onMouseDown={stopPropagation}>
        <OutsideClick onClose={hideToolbarTools}>
          {/* @ts-ignore */}
          <Toolbar toolbarRef={toolbarRef} toolbarStyle={toolbarStyle} editor={editor} />
        </OutsideClick>
        <SuggestionElementList
          filterListCallback={filterSuggestionList}
          style={suggesstionListStyle}
          onClose={hideSuggestionList}
          selectedElementType={selectedElement?.type}
          isOpen={isSuggesstionListOpen}
          changeNodeType={changeNodeType}
          ref={suggestionListRef}
        />
        <Editable
          renderLeaf={renderLeaf}
          renderElement={renderElement}
          // renderElement={renderElementFake}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          readOnly={isReadOnly}
          spellCheck
          decorate={decorate}
          // decorate={decorateFake}
          autoFocus
          id="yopta-contenteditable"
          onCopy={onCopyYoptaNodes}
          {...eventHandlers}
        />
      </div>
    </main>
  );
};

export { EditorYopta };
