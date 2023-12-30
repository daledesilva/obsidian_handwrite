import InkPlugin from "src/main";
import { buildWritingFileData, stringifyPageData } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-tldraw-writing-store";
import { FOLDER_NAME } from "src/constants";
import { getNewTimestampedWritingFilepath } from "src/utils/file-manipulation";






const createNewWritingFile = async (plugin: InkPlugin) => {
    const filepath = await getNewTimestampedWritingFilepath(plugin);
    const pageData = buildWritingFileData({
        tldrawData: defaultSnapshot,
    });
    const noteRef = await plugin.app.vault.create(filepath, stringifyPageData(pageData));
    return noteRef;
}


export default createNewWritingFile;