"""Parse saved AppDoc HTML independently of browser DOM extraction; no network access."""
import collections
import json
from html.parser import HTMLParser
from pathlib import Path

class Node:
    def __init__(self,tag='',attrs=None):
        self.tag=tag
        self.attrs=dict(attrs or [])
        self.children=[]
    def text(self):
        return ''.join(x if isinstance(x,str) else x.text() for x in self.children)
    def all(self,tag):
        for child in self.children:
            if isinstance(child,Node):
                if child.tag==tag:
                    yield child
                yield from child.all(tag)

class Tree(HTMLParser):
    VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self,text):
        super().__init__(convert_charrefs=True)
        self.root=Node('document');self.stack=[self.root]
        self.feed(text)
    def handle_starttag(self,tag,attrs):
        node=Node(tag,attrs);self.stack[-1].children.append(node)
        if tag not in self.VOID:self.stack.append(node)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:
                self.stack=self.stack[:i];break
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in self.VOID:self.handle_endtag(tag)
    def handle_data(self,data):self.stack[-1].children.append(data)

def html_tables(path):
    tree=Tree(Path(path).read_text(encoding='utf8'))
    result=[]
    for index,table in enumerate(tree.root.all('table')):
        rows=[]
        for row in table.all('tr'):
            cells=[]
            for cell in row.children:
                if not isinstance(cell,Node) or cell.tag not in ('td','th'):continue
                lists=[x for x in cell.children if isinstance(x,Node) and x.tag in ('ul','ol')]
                cells.append([li.text().strip() for li in lists[0].children if isinstance(li,Node) and li.tag=='li'] if lists else cell.text().strip())
            rows.append(cells)
        result.append({'ordinal':index,'type':table.attrs.get('data-type'),'index':table.attrs.get('data-index'),'rows':rows})
    return result

def properties(record):
    result={}
    for row in record['rows']:
        if len(row)==1 and not row[0]:continue
        if len(row)!=2 or not isinstance(row[0],str) or row[0] in result:
            raise ValueError('Ambiguous property row at table '+str(record['ordinal']))
        result[row[0]]=row[1]
    return result

def objects(records):
    datasets={};schemas={};result={};schema=None
    for record in records:
        kind=record['type']
        if kind is None:continue
        props=properties(record)
        if kind=='DataSets':
            name=props['Table name']
            if name in datasets:raise ValueError('Duplicate table '+name)
            datasets[name]=props
        elif kind=='DataSchemas':
            schema=props['Schema Name']
            if schema in schemas:raise ValueError('Duplicate schema '+schema)
            schemas[schema]={'definition':props,'columns':{}}
        elif kind=='SchemaField':
            name=props['Column name']
            if schema is None or name in schemas[schema]['columns']:raise ValueError('Unassigned/duplicate column '+name)
            schemas[schema]['columns'][name]=props
        else:
            if kind=='TableSlices':objkind='slice';name=props['Slice Name']
            elif kind=='Controls' and 'View name' in props:objkind='view';name=props['View name']
            elif kind=='Controls' and 'Action name' in props:objkind='action';name=props.get('For a record of this table','')+'.'+props['Action name']
            elif kind=='Controls' and 'Rule name' in props:objkind='format-rule';name=props['Rule name']
            else:raise ValueError('Unrecognized AppDoc category '+str(kind))
            key=(objkind,name)
            if key in result:raise ValueError('Duplicate object '+str(key))
            result[key]={'definition':props}
    for name,binding in datasets.items():
        schema_name=binding.get('Schema')
        if schema_name not in schemas:raise ValueError('Missing schema for '+name)
        result[('table',name)]={'binding':binding,'schema':schemas[schema_name]['definition'],'columns':schemas[schema_name]['columns']}
    if set(schemas)!={x.get('Schema') for x in datasets.values()}:raise ValueError('Orphan AppDoc schema')
    counts=collections.Counter(k[0] for k in result)
    counts['column']=sum(len(s['columns']) for s in schemas.values())
    expected={}
    for _,items in records[0]['rows']:
        for item in items:
            number,label=item.split(' ',1)
            expected[label]=int(number)
    for label,kind in {'Tables':'table','Columns':'column','Slices':'slice','Views':'view','Format Rules':'format-rule','Actions':'action'}.items():
        if expected[label]!=counts[kind]:raise ValueError('Summary count mismatch '+label)
    if expected.get('Workflow Rules')!=0:raise ValueError('Unexpected legacy workflow coverage')
    return result,dict(counts),properties(records[1])

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('private_folder');args=parser.parse_args()
    for path in sorted(Path(args.private_folder).glob('*-tables.json')):
        if path.name.endswith('-final-tables.json'):continue
        records=json.loads(path.read_text(encoding='utf8'))
        independent=html_tables(path.with_name(path.name.replace('-tables.json','-appdoc.html')))
        if independent!=records:raise ValueError('HTML/DOM extraction mismatch: '+path.name)
        result,counts,settings=objects(records)
        print(json.dumps({'target':path.name.replace('-tables.json',''),'html_dom_equal':True,'counts':counts,'version':settings['Version']}))
