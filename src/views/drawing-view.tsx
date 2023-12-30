import { SerializedStore, TLRecord, TLUiOverrides, Editor } from "@tldraw/tldraw";
import { Menu, MenuItem, TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { DRAW_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import TldrawDrawingEditor from "src/tldraw/drawing/tldraw-drawing-editor";
import TldrawHandwrittenEditor from "src/tldraw/writing/tldraw-writing-editor";
import { InkFileData, stringifyPageData } from "src/utils/page-file";

////////
////////

export const DRAWING_VIEW_TYPE = "ink_drawing-view";
export enum ViewPosition {
    replacement,
    tab,
    verticalSplit,
    horizontalSplit
}



export function registerDrawingView (plugin: InkPlugin) {
    plugin.registerView(
        DRAWING_VIEW_TYPE,
        (leaf) => new DrawingView(leaf, plugin)
    );
    plugin.registerExtensions([DRAW_FILE_EXT], DRAWING_VIEW_TYPE);
}


export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    saveFile = (pageData: InkFileData) => {
        this.pageData = pageData;
        this.save(false);   // this called getViewData
    }

    getViewType(): string {
        return DRAWING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handwritten note";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        const pageData = JSON.parse(fileContents) as InkFileData;
        this.pageData = pageData;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new handwriting file is opening in the same leaf, then clear the old one
        if(this.root) this.clear();
        
        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawDrawingEditor
                plugin = {this.plugin}
                filepath = {this.file.path}
                pageData = {this.pageData}
                save = {this.saveFile}
			/>
        );
    }
    
    // This allows you to return the data you want obsidian to save (Called when file is closing)
    getViewData = (): string => {
        const fileContents = stringifyPageData(this.pageData);
        return fileContents;
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that old files can save data into new ones)
        this.root?.unmount();
    }

    
    // onPaneMenu(menu: Menu, source: 'more-options' | 'tab-header' | string): void {
    //     menu.addItem((item) => {
    //         item.setTitle('Convert to Write file');
    //         item.setSection('action');
    //         item.onClick( () => {
    //             console.log('clicked');
    //         })
    //     })
    //     super.onPaneMenu(menu, source);
    // }

    // onResize()

}











