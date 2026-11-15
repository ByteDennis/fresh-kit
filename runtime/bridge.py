#!/usr/bin/env python3
"""A local-only debugging bridge between Fresh and debugpy's DAP adapter."""
import json, os, socket, subprocess, sys, threading, time

SOCKET=sys.argv[2]
def communicate(data):
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(15); client.connect(SOCKET)
        client.sendall(json.dumps(data).encode()+b'\n')
        reader=client.makefile('rb'); return json.loads(reader.readline())

if sys.argv[1]=='call':
    try: print(json.dumps(communicate(json.loads(sys.argv[3]))))
    except Exception as e: print(json.dumps({'ok':False,'error':str(e)}))
    raise SystemExit

try: os.setsid()
except OSError: pass

class Adapter:
    def __init__(self):
        self.process=None; self.seq=0; self.pending={}; self.write_lock=threading.Lock(); self.initialized=threading.Event()
        self.state={'status':'idle','variables':[],'globals':[],'frames':[],'selected_frame':0,'line':None,'file':None,'execution_line':None,'execution_file':None,'output':'','error':None}; self.pause_generation=0; self.lock=threading.RLock()
    def send(self,cmd,args=None):
        with self.write_lock:
            self.seq+=1; seq=self.seq; event=threading.Event(); self.pending[seq]=[event,None]
            data=json.dumps({'seq':seq,'type':'request','command':cmd,'arguments':args or {}}).encode()
            self.process.stdin.write(f'Content-Length: {len(data)}\r\n\r\n'.encode()+data); self.process.stdin.flush()
        return seq
    def wait(self,seq,timeout=12):
        item=self.pending[seq]
        if not item[0].wait(timeout):
            self.pending.pop(seq,None); raise TimeoutError('DAP timed out')
        self.pending.pop(seq,None); result=item[1]
        if not result.get('success',True): raise RuntimeError(result.get('message','DAP request failed'))
        return result.get('body',{})
    def request(self,cmd,args=None): return self.wait(self.send(cmd,args))
    def reader(self):
        try:
            while True:
                header={}
                while True:
                    line=self.process.stdout.readline()
                    if not line: return
                    if line in (b'\r\n',b'\n'): break
                    name,value=line.decode().split(':',1);header[name.lower()]=value.strip()
                msg=json.loads(self.process.stdout.read(int(header['content-length'])))
                if msg.get('type')=='response':
                    item=self.pending.get(msg.get('request_seq'))
                    if item: item[1]=msg;item[0].set()
                elif msg.get('type')=='event':
                    event=msg.get('event');body=msg.get('body',{})
                    if event=='initialized': self.initialized.set()
                    elif event=='stopped':
                        with self.lock:
                            self.pause_generation+=1; generation=self.pause_generation
                            self.state.update(status='stopped',thread=body.get('threadId'),frames=[],variables=[],globals=[],selected_frame=0,execution_line=None,execution_file=None)
                        threading.Thread(target=self.inspect,args=(body.get('threadId'),generation),daemon=True).start()
                    elif event in ('terminated','exited'):
                        with self.lock:self.state['status']='finished'
                    elif event=='continued':
                        with self.lock:
                            self.pause_generation+=1; self.state.update(status='running',variables=[],globals=[],frames=[],line=None,execution_line=None,execution_file=None)
                    elif event=='output' and body.get('category') in ('stdout','stderr','console'):
                        with self.lock:self.state['output']=(self.state['output']+body.get('output',''))[-6000:]
        except Exception as e:
            with self.lock:self.state.update(status='error',error=str(e))
    def select_frame(self,index,generation=None):
        with self.lock:
            if self.state['status'] != 'stopped': raise ValueError('Program is not paused')
            frames=self.state['frames']
            if index < 0 or index >= len(frames): raise ValueError('No such stack frame')
            frame=frames[index]; current=self.pause_generation
            if generation is not None and generation != current: return
        scopes=self.request('scopes',{'frameId':frame['id']}).get('scopes',[])
        scope=next((x for x in scopes if x.get('name') in ('Locals','Local')),scopes[0] if scopes else None)
        values=self.request('variables',{'variablesReference':scope['variablesReference'],'start':0,'count':100}).get('variables',[]) if scope else []
        global_scope=next((x for x in scopes if x.get('name') in ('Globals','Global')),None)
        globals_=self.request('variables',{'variablesReference':global_scope['variablesReference'],'start':0,'count':100}).get('variables',[]) if global_scope else []
        expanded=[]
        for value in globals_:
            if value.get('name') in ('function variables','special variables') and value.get('variablesReference'):
                expanded.extend(self.request('variables',{'variablesReference':value['variablesReference'],'start':0,'count':100}).get('variables',[]))
            else: expanded.append(value)
        globals_=expanded
        with self.lock:
            if current!=self.pause_generation or self.state['status']!='stopped': return
            self.state.update(file=frame.get('path'),line=frame.get('line'),selected_frame=index,variables=[{'name':v.get('name'),'value':v.get('value'),'type':v.get('type')} for v in values[:100]],globals=[{'name':v.get('name'),'value':v.get('value'),'type':v.get('type')} for v in globals_ if not v.get('name','').startswith('__')][:100])
    def inspect(self,thread,generation):
        try:
            frames=self.request('stackTrace',{'threadId':thread}).get('stackFrames',[])
            with self.lock:
                if generation!=self.pause_generation or self.state['status']!='stopped': return
                self.state['frames']=[{'id':f['id'],'name':f.get('name','?'),'path':f.get('source',{}).get('path'),'line':f.get('line')} for f in frames]
                if frames: self.state.update(execution_line=frames[0].get('line'),execution_file=frames[0].get('source',{}).get('path'))
            if frames:self.select_frame(0,generation)
        except Exception as e:
            with self.lock:
                if generation==self.pause_generation:self.state['error']=str(e)
    def start(self,data):
        if self.process and self.process.poll() is None:raise ValueError('Debug session already active')
        self.initialized.clear(); self.state.update(status='starting',variables=[],line=None,file=data['file'],output='',error=None)
        env=os.environ.copy(); env['PYTHONPATH']=data.get('debugpy_path','')+os.pathsep+env.get('PYTHONPATH','')
        self.process=subprocess.Popen([data['python'],'-m','debugpy.adapter'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=env)
        threading.Thread(target=self.reader,daemon=True).start()
        self.request('initialize',{'adapterID':'python','linesStartAt1':True,'columnsStartAt1':True,'supportsRunInTerminalRequest':False})
        launch=self.send('launch',{'name':'Fresh Python','type':'python','request':'launch','program':data['file'],'python':data['python'],'cwd':data['cwd'],'console':'internalConsole','justMyCode':True})
        if not self.initialized.wait(12):raise TimeoutError('Debug adapter did not initialize')
        self.request('setBreakpoints',{'source':{'path':data['file']},'breakpoints':[n if isinstance(n,dict) else {'line':n} for n in data['breakpoints']]})
        self.request('configurationDone');self.wait(launch)
        with self.lock:
            if self.state['status']=='starting':self.state['status']='running'
    def run(self,data):
        op=data['op']
        if op=='start': self.start(data)
        elif op=='status':pass
        elif op=='frame': self.select_frame(int(data['index']))
        elif op=='evaluate':
            with self.lock:
                if self.state['status']!='stopped' or not self.state['frames']: raise ValueError('Program is not paused')
                frame=self.state['frames'][self.state['selected_frame']]['id']
            with self.lock:self.state['output']=(self.state['output']+'\n>>> '+data['expression']+'\n')[-6000:]
            try:
                result=self.request('evaluate',{'expression':data['expression'],'frameId':frame,'context':'repl'})
                if result.get('result'):
                    with self.lock:self.state['output']=(self.state['output']+str(result['result'])+'\n')[-6000:]
            except Exception as exc:
                with self.lock:self.state['output']=(self.state['output']+str(exc)+'\n')[-6000:]
            self.select_frame(self.state['selected_frame'])
        elif op=='breakpoints':self.request('setBreakpoints',{'source':{'path':data['file']},'breakpoints':[n if isinstance(n,dict) else {'line':n} for n in data['breakpoints']]})
        elif op in ('continue','next','stepIn','stepOut'):
            thread=self.state.get('thread')
            if self.state['status']!='stopped' or not thread:raise ValueError('Program is not paused')
            self.request(op,{'threadId':thread})
        elif op=='stop':
            if self.process and self.process.poll() is None:
                try:self.request('disconnect',{'terminateDebuggee':True})
                except Exception:self.process.terminate()
            with self.lock:self.state['status']='finished'
        else:raise ValueError('Unknown operation')
        with self.lock:return {'ok':True,**self.state}

adapter=Adapter()
with socket.socket(socket.AF_UNIX) as server:
    server.bind(SOCKET)
    if os.name != "nt": os.chmod(SOCKET,0o600)
    server.listen(5);server.settimeout(1)
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        try:conn,_=server.accept()
        except socket.timeout:continue
        deadline=time.monotonic()+15
        with conn:
            try:
                conn.settimeout(20); raw=conn.makefile('rb').readline(1048576); data=json.loads(raw); result=adapter.run(data)
            except Exception as e: result={'ok':False,'error':str(e)}
            conn.sendall(json.dumps(result).encode()+b'\n')
            if data.get('op')=='stop': break
if adapter.process and adapter.process.poll() is None:
    if adapter.state.get("status") != "finished":
        try: adapter.request("disconnect",{"terminateDebuggee":True})
        except Exception: pass
    if adapter.process.poll() is None: adapter.process.terminate()
try: os.unlink(SOCKET)
except OSError: pass
