// R090 assistant text renderer (design §6.2): paragraphs, **bold**, "- " bullets, pipe tables and line breaks.
// Everything else stays plain text. This file only parses into a small tree; ChatMessage turns the tree into React
// elements, so model text is never parsed as HTML. No imports, so the unit tests transpile it on its own.

export type Inline={kind:'text';text:string}|{kind:'strong';text:string}|{kind:'break'};
export type Block={kind:'paragraph';inlines:Inline[]}|{kind:'list';items:Inline[][]}|{kind:'table';head:Inline[][]|null;rows:Inline[][][]};

const BULLET=/^\s*[-*•]\s+(.*)$/u;
const TABLE_ROW=/^\s*\|.*\|\s*$/u;
const SEPARATOR=/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/u;

/** `**bold**` spans; an unmatched `**` stays as typed. */
export function parseInline(text:string):Inline[]{
 const out:Inline[]=[];let rest=text;
 const push=(value:string)=>{if(!value)return;const last=out.at(-1);if(last?.kind==='text')last.text+=value;else out.push({kind:'text',text:value})};
 for(;;){
  const open=rest.indexOf('**');if(open<0){push(rest);break}
  const close=rest.indexOf('**',open+2);
  if(close<0||close===open+2){push(rest.slice(0,open+2));rest=rest.slice(open+2);continue}
  push(rest.slice(0,open));out.push({kind:'strong',text:rest.slice(open+2,close)});rest=rest.slice(close+2);
 }
 return out;
}
/** Cells of one pipe row; `\|` is a literal pipe inside a cell. */
export function tableCells(row:string):string[]{
 const body=row.trim().replace(/^\|/u,'').replace(/(?<!\\)\|$/u,'');
 return body.split(/(?<!\\)\|/u).map(cell=>cell.replaceAll('\\|','|').trim());
}
export function parseMarkdown(source:string):Block[]{
 const lines=source.replace(/\r\n?/gu,'\n').split('\n'),blocks:Block[]=[];
 let paragraph:Inline[]|null=null;
 const endParagraph=()=>{if(paragraph?.length)blocks.push({kind:'paragraph',inlines:paragraph});paragraph=null};
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(!line.trim()){endParagraph();continue}
  if(TABLE_ROW.test(line)){
   endParagraph();const rows:string[]=[];
   while(index<lines.length&&TABLE_ROW.test(lines[index]))rows.push(lines[index++]);index--;
   const headed=rows.length>1&&SEPARATOR.test(rows[1]);
   const body=(headed?rows.slice(2):rows).filter(row=>!SEPARATOR.test(row));
   blocks.push({kind:'table',head:headed?tableCells(rows[0]).map(parseInline):null,rows:body.map(row=>tableCells(row).map(parseInline))});
   continue;
  }
  const bullet=BULLET.exec(line);
  if(bullet){
   endParagraph();const items:Inline[][]=[];
   while(index<lines.length){const match=BULLET.exec(lines[index]);if(!match)break;items.push(parseInline(match[1].trim()));index++}
   index--;blocks.push({kind:'list',items});continue;
  }
  const inlines=parseInline(line.trim());
  if(paragraph){paragraph.push({kind:'break'},...inlines)}else paragraph=inlines;
 }
 endParagraph();
 return blocks;
}
