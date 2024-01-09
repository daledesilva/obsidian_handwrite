import { Canvg } from 'canvg';

//////////
//////////

export async function svgToDataUri(svgElement: SVGElement): Promise<string | null> {
	try {
		// Extract width and height from the SVG element
		let width = svgElement.getAttribute('width') ? Number(svgElement.getAttribute('width')) : 0;
		let height = svgElement.getAttribute('height') ? Number(svgElement.getAttribute('height')) : 0;
		
        // Scale up or down
		if (width > 1500 || height > 2000) {
			while(width > 1500) {
				width /= 2;
				height /= 2;
			}
		} else if(width < 500) {
			while(width < 500) {
				width *= 2;
				height *= 2;
			}
		} 
		
		// Set canvas dimensions
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			console.error(`Error converting SVG to PNG: ${'2d canvas context not found'}`);
			return null;
		}
		
		// Render SVG onto canvas
		const xmlSerialiser = new XMLSerializer();
		const svgStr = xmlSerialiser.serializeToString(svgElement);
		const canvgRenderer = await Canvg.from(ctx, svgStr);
        canvgRenderer.resize(width, height, 'xMidYMid meet')
		canvgRenderer.start();
		
		// Convert canvas to PNG data URI with transparent background
		const dataUri = canvas.toDataURL('image/png', {alpha: true})
		
		// Remove temporary canvas element
		canvgRenderer.stop();
		canvas.remove();

		return dataUri;
	} catch (error) {
		console.error(`Error converting SVG to PNG: ${error}`);
		return null;
	}
}


export function dataUriToBase64Image(dataUri: string): string {
	return dataUri.slice(dataUri.indexOf(',') + 1);
}