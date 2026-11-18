export function isTextControl(target:EventTarget|null):boolean{
 if(!(target instanceof HTMLElement))return false;
 return target.isContentEditable||Boolean(target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="slider"],[role="combobox"]'));
}
