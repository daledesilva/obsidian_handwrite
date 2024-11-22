import './tldraw-drawing-editor.scss';
import { Editor, HistoryEntry, StoreSnapshot, TLRecord, TLStoreSnapshot, TLUiOverrides, Tldraw, TldrawEditor, TldrawHandles, TldrawOptions, TldrawScribble, TldrawSelectionBackground, TldrawSelectionForeground, TldrawShapeIndicators, defaultShapeTools, defaultShapeUtils, defaultTools, getSnapshot } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, adaptTldrawToObsidianThemeMode, getActivityType, getDrawingSvg, initDrawingCamera, prepareDrawingSnapshot, preventTldrawCanvasesCausingObsidianGestures } from "../../utils/tldraw-helpers";
import InkPlugin from "../../main";
import * as React from "react";
import { svgToPngDataUri } from 'src/utils/screenshots';
import { TFile } from 'obsidian';
import { savePngExport } from "src/utils/savePngExport";
import { duplicateWritingFile, rememberDrawingFile } from "src/utils/rememberDrawingFile";
import { InkFileData, buildDrawingFileData } from 'src/utils/page-file';
import { DRAW_SHORT_DELAY_MS, DRAW_LONG_DELAY_MS } from 'src/constants';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import DrawingMenu from '../drawing-menu/drawing-menu';
import ExtendedDrawingMenu from '../extended-drawing-menu/extended-drawing-menu';
import { openInkFile } from 'src/utils/open-file';
import classNames from 'classnames';

///////
///////

const myOverrides: TLUiOverrides = {}

const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 10, // Slight amount to prevent cropping overflows from stroke thickness
}

const defaultComponents = {
	Scribble: TldrawScribble,
	ShapeIndicators: TldrawShapeIndicators,
	CollaboratorScribble: TldrawScribble,
	SelectionForeground: TldrawSelectionForeground,
	SelectionBackground: TldrawSelectionBackground,
	Handles: TldrawHandles,
}

export function TldrawDrawingEditor(props: {
	onReady?: Function,
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => void,

	// For embeds
	embedded?: boolean,
	registerControls?: Function,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	commonExtendedOptions?: any[]
}) {

	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tldrawContainerElRef = useRef<HTMLDivElement>(null);
	const tlEditorRef = useRef<Editor>();
	const [tlStoreSnapshot] = React.useState<StoreSnapshot<TLRecord>>(prepareDrawingSnapshot(props.pageData.tldraw))

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;

		// General setup
		preventTldrawCanvasesCausingObsidianGestures(editor);

		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		editor.updateInstanceState({
			isGridMode: true,
		})

		// view setup
		initDrawingCamera(editor);
		if (props.embedded) {
			editor.setCameraOptions({
				isLocked: true,
			})
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// TODO: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingCompleted:
					queueOrRunStorePostProcesses(editor);
					embedPostProcess(editor);
					break;

				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(editor);
					embedPostProcess(editor);	// REVIEW: This could go inside a post process
					break;

				default:
					// Catch anything else not specifically mentioned (ie. erase, draw shape, etc.)
					queueOrRunStorePostProcesses(editor);
				// console.log('Activity not recognised.');
				// console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserActionListener();
		}

		if (props.registerControls) {
			props.registerControls({
				save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor)
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
			})
		}

		if (props.onReady) props.onReady();

		return () => {
			unmountActions();
		};
	}

	const embedPostProcess = (editor: Editor) => {
		// resizeContainerIfEmbed(editor);
	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		// simplifyLines(editor, entry);
	};

	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();

		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			DRAW_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a slight delay
	const longDelayInputPostProcess = (editor: Editor) => {
		resetLongPostProcessTimer();

		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			DRAW_LONG_DELAY_MS
		)

	};

	const resetShortPostProcessTimer = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
	}
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
		resetShortPostProcessTimer();
		resetLongPostProcessTimer();
	}

	const incrementalSave = async (editor: Editor) => {
		console.log('incrementalSave');
		const tlEditorSnapshot = getSnapshot(editor.store);
		const tlStoreSnapshot = tlEditorSnapshot.document;

		const pageData = buildDrawingFileData({
			tlStoreSnapshot,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		console.log('completeSave');
		let previewUri;

		const tlEditorSnapshot = getSnapshot(editor.store);
		const tlStoreSnapshot = tlEditorSnapshot.document;
		const svgObj = await getDrawingSvg(editor);


		if (svgObj) {
			previewUri = svgObj.svg;//await svgToPngDataUri(svgObj)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

		if (previewUri) {
			const pageData = buildDrawingFileData({
				tlStoreSnapshot,
				previewUri,
			})
			props.save(pageData);
			// savePngExport(props.plugin, previewUri, props.fileRef)

		} else {
			const pageData = buildDrawingFileData({
				tlStoreSnapshot,
			})
			props.save(pageData);
		}

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	function handleSignal(signal: string) {
		switch (signal) {
			case "toggle-fullscreen":
				if (tldrawContainerElRef.current)
					if (document.fullscreenElement)
						document.exitFullscreen();
					else
						tldrawContainerElRef.current.requestFullscreen();
				break;
		}
	}

	//////////////

	return <>
		<div
			ref={tldrawContainerElRef}
			className={classNames([
				"ddc_ink_drawing-editor"
			])}
			style={{
				height: '100%',
				position: 'relative'
			}}
		>
			<TldrawEditor
				options={tlOptions}
				shapeUtils={[...defaultShapeUtils]}
				tools={[...defaultTools, ...defaultShapeTools]}
				initialState="draw"
				snapshot={tlStoreSnapshot}
				// persistenceKey = {props.fileRef.path}

				// bindingUtils = {defaultBindingUtils}
				components={defaultComponents}

				onMount={handleMount}

				// Ensure cursor remains and embed IS NOT focussed if it's an embed.
				// This prevents tldraw scrolling the page to the top of the embed when turning on.
				// But a side effect of false is preventing mousewheel scrolling and zooming.
				autoFocus={props.embedded ? false : true}
			/>

			<PrimaryMenuBar>
				<DrawingMenu
					getTlEditor={getTlEditor}
					onStoreChange={(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
					sendSignal={(signal: string) => handleSignal(signal)}
				/>
				{props.embedded && props.commonExtendedOptions && (
					<ExtendedDrawingMenu
						onLockClick={async () => {
							// TODO: Save immediately incase it hasn't been saved yet?
							if (props.closeEditor) props.closeEditor();
						}}
						menuOptions={props.commonExtendedOptions}
					/>
				)}
			</PrimaryMenuBar>
		</div>
	</>;

};
