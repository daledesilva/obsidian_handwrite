import "./writing-embed.scss";
import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditor } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TransitionMenuBar } from "../transition-menu-bar/transition-menu-bar";
import { openInkFile } from "src/utils/open-file";
import { TFile, Notice } from "obsidian";
import { duplicateWritingFile } from "src/utils/file-manipulation";
import { isEmptyWritingFile } from "src/utils/helpers";

///////
///////

enum tool {
	nothing,
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

export type WritingEditorControls = {
	save: Function,
	saveAndFreeze: Function,
}

export function WritingEmbed (props: {
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => void,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const [isEditMode, setIsEditMode] = useState<boolean>(false);
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<WritingEditorControls>();

	const registerEditorControls = (handlers: WritingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	// on mount
	React.useEffect( () => {
		if(isEmptyWritingFile(props.pageData.tldraw)) setIsEditMode(true);
	}, [])

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_writing-embed'
			style = {{
				// height: '400px',
			}}
		>
			{(!isEditMode && !curPageData.previewUri) && (
				<p>No screenshot yet</p>
			)}
			{/* {(!isEditMode && previewFilePath) && ( */}
			{(!isEditMode && curPageData.previewUri) && (
				<WritingEmbedPreview
					src = {curPageData.previewUri}
					// src = {previewFilePath}
				/>
			)}
			{isEditMode && (
				<TldrawWritingEditor
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Conver tthis to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
				/>
			)}
			<TransitionMenuBar
				isEditMode = {isEditMode}
				onOpenClick = {async () => {
					openInkFile(props.plugin, props.fileRef)
				}}
				onEditClick = { async () => {
					const newPageData = await refreshPageData();
					setIsEditMode(true);
					setCurPageData(newPageData);
				}}
				onFreezeClick = { async () => {
					await editorControlsRef.current?.saveAndFreeze();
					setIsEditMode(false);
					const newPageData = await refreshPageData();
					setCurPageData(newPageData);
				}}
				onDuplicateClick = { async () => {
					await duplicateWritingFile(props.plugin, props.fileRef);
				}}
			/>
		</div>
	</>;
	

	// Helper functions
	///////////////////

	async function refreshPageData(): Promise<InkFileData> {
		console.log('refreshing pageData');
		const v = props.plugin.app.vault;
		const pageDataStr = await v.read(props.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData;
		return pageData;
	}

	function applyPostMountSettings(editor: Editor) {
		editor.updateInstanceState({
			isDebugMode: false,
			// isGridMode: false,
			canMoveCamera: false,
		})
	}

	function zoomToPageWidth(editor: Editor) {
		const pageBounds = editor.currentPageBounds;
		if(pageBounds) {
			// REVIEW: This manipulations are a hack because I don't know how to get it to zoom exactly to the bounds rather than adding buffer
			pageBounds.x /= 3.5;
			pageBounds.y *= 2.3;
			pageBounds.w /= 2;
			pageBounds.h /= 2;
			editor.zoomToBounds(pageBounds);
		} else {
			console.log('zooming to FIT')
			editor.zoomToFit();
		}
	}
	
};

export default WritingEmbed;




const WritingEmbedPreview: React.FC<{ 
	src: string,
}> = (props) => {

	return <div>
		<img
			src = {props.src}
			style = {{
				width: '100%'
			}}
		/>
	</div>

};




