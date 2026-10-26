from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse, Response
from typing import Optional
from pathlib import Path
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import sqlite3, os, csv, io, json, hashlib, hmac, secrets, base64, calendar
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT=Path(__file__).resolve().parent; (ROOT/'data').mkdir(exist_ok=True); DB=ROOT/'data'/'expensewise.db'
SECRET=os.getenv('EXPENSEWISE_SECRET','demo-secret-change-before-deploying')
app=FastAPI(title='ExpenseWise API',version='2.0.0',description='Advanced personal finance tracker')
app.add_middleware(CORSMiddleware,allow_origins=['*'],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
DEFAULT=[('Food','expense'),('Transport','expense'),('Shopping','expense'),('Bills','expense'),('Health','expense'),('Education','expense'),('Entertainment','expense'),('Rent','expense'),('Other','expense'),('Salary','income'),('Freelance','income'),('Gift','income'),('Other income','income')]
def db():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); return c
def init():
 with db() as c: c.executescript('''
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,is_default INTEGER DEFAULT 0,UNIQUE(user_id,name,type),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,category_id INTEGER,type TEXT NOT NULL,amount REAL NOT NULL,transaction_date TEXT NOT NULL,payment_method TEXT DEFAULT 'Other',note TEXT DEFAULT '',import_reference TEXT,recurring_key TEXT UNIQUE,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(category_id) REFERENCES categories(id));
 CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id,transaction_date);
 CREATE TABLE IF NOT EXISTS budgets(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,category_id INTEGER,month INTEGER NOT NULL,year INTEGER NOT NULL,limit_amount REAL NOT NULL,threshold_percent INTEGER DEFAULT 80,UNIQUE(user_id,category_id,month,year),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,title TEXT NOT NULL,target_amount REAL NOT NULL,current_amount REAL DEFAULT 0,target_date TEXT,status TEXT DEFAULT 'active',created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS recurring_rules(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,category_id INTEGER,type TEXT,amount REAL,frequency TEXT,next_run_date TEXT,payment_method TEXT DEFAULT 'Other',note TEXT DEFAULT '',active INTEGER DEFAULT 1,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS import_jobs(id INTEGER PRIMARY KEY,user_id INTEGER,filename TEXT,status TEXT,rows_processed INTEGER DEFAULT 0,rows_rejected INTEGER DEFAULT 0,created_at TEXT,preview_json TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
 ''')
init()
def pwdhash(p):
 salt=secrets.token_bytes(16); return base64.b64encode(salt+hashlib.pbkdf2_hmac('sha256',p.encode(),salt,240000)).decode()
def checkpwd(p,s):
 try:
  x=base64.b64decode(s); return hmac.compare_digest(hashlib.pbkdf2_hmac('sha256',p.encode(),x[:16],240000),x[16:])
 except Exception:return False
def token(uid):
 payload=f'{uid}:{int((datetime.utcnow()+timedelta(hours=12)).timestamp())}'; sig=hmac.new(SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest(); return base64.urlsafe_b64encode(f'{payload}:{sig}'.encode()).decode()
def user_dep(authorization:Optional[str]=Header(None)):
 if not authorization or not authorization.lower().startswith('bearer '): raise HTTPException(401,'Please log in.')
 try:
  raw=base64.urlsafe_b64decode(authorization.split(' ',1)[1]).decode(); uid,exp,sig=raw.split(':'); payload=f'{uid}:{exp}'
  if not hmac.compare_digest(sig,hmac.new(SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest()) or int(exp)<int(datetime.utcnow().timestamp()): raise ValueError()
  with db() as c:r=c.execute('SELECT id,name,email FROM users WHERE id=?',(int(uid),)).fetchone()
  if not r:raise ValueError()
  return dict(r)
 except Exception:raise HTTPException(401,'Session expired. Log in again.')
def amt(v):
 try:
  d=Decimal(str(v)); assert d.is_finite() and d>0; return round(float(d),2)
 except Exception:raise HTTPException(422,'Amount must be a positive number.')
def dt(v):
 try:return date.fromisoformat(str(v)).isoformat()
 except Exception:raise HTTPException(422,'Date must be YYYY-MM-DD.')
def catid(c,uid,name,typ):
 name=(name or ('Other' if typ=='expense' else 'Other income')).strip()[:40]
 r=c.execute('SELECT id FROM categories WHERE user_id=? AND name=? AND type=?',(uid,name,typ)).fetchone()
 if r:return r['id']
 c.execute('INSERT OR IGNORE INTO categories(user_id,name,type) VALUES(?,?,?)',(uid,name,typ));return c.execute('SELECT id FROM categories WHERE user_id=? AND name=? AND type=?',(uid,name,typ)).fetchone()['id']
def totals(c,uid,start,end):
 o={'income':0.0,'expense':0.0}; rows=c.execute('SELECT type,SUM(amount) total FROM transactions WHERE user_id=? AND transaction_date BETWEEN ? AND ? GROUP BY type',(uid,start,end)).fetchall()
 for r in rows:o[r['type']]=round(r['total'] or 0,2)
 o['balance']=round(o['income']-o['expense'],2);return o
def bounds(y,m):
 s=date(y,m,1); e=date(y+1,1,1) if m==12 else date(y,m+1,1);return s.isoformat(),(e-timedelta(days=1)).isoformat()
def budget_rows(c,uid,m,y):
 rows=c.execute('SELECT b.*,ca.name category FROM budgets b LEFT JOIN categories ca ON ca.id=b.category_id WHERE b.user_id=? AND b.month=? AND b.year=?',(uid,m,y)).fetchall(); out=[]
 for b in rows:
  args=[uid,f'{m:02d}',str(y)]; sql="SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=? AND type='expense' AND strftime('%m',transaction_date)=? AND strftime('%Y',transaction_date)=?"
  if b['category_id']:sql+=' AND category_id=?';args.append(b['category_id'])
  spent=c.execute(sql,args).fetchone()[0]; lim=b['limit_amount'];out.append({'id':b['id'],'category':b['category'],'month':m,'year':y,'limit_amount':lim,'spent':round(spent,2),'remaining':round(lim-spent,2),'percent':round(spent/lim*100,1),'threshold_percent':b['threshold_percent']})
 return out
class Auth(BaseModel): name:Optional[str]=None; email:str; password:str=Field(min_length=8,max_length=128)
class Tx(BaseModel): type:str; amount:float; transaction_date:str; category:str='Other'; payment_method:str='Other'; note:str=''
class Budget(BaseModel): category:Optional[str]=None; month:int=Field(ge=1,le=12); year:int=Field(ge=2000,le=2200); limit_amount:float; threshold_percent:int=Field(default=80,ge=1,le=100)
class Goal(BaseModel): title:str; target_amount:float; current_amount:float=0; target_date:Optional[str]=None
class GoalPatch(BaseModel): title:Optional[str]=None; target_amount:Optional[float]=None; current_amount:Optional[float]=None; target_date:Optional[str]=None
class Recurring(BaseModel): type:str; amount:float; category:str='Other'; frequency:str; next_run_date:str; payment_method:str='Other'; note:str=''
@app.get('/api/health')
def health():return {'status':'ok','database':'sqlite','version':'2.0.0'}
@app.post('/api/auth/register')
def register(x:Auth):
 email=x.email.strip().lower()
 if '@' not in email or '.' not in email.split('@')[-1]:raise HTTPException(422,'Enter a valid email.')
 if not x.name or len(x.name.strip())<2:raise HTTPException(422,'Name must have at least 2 characters.')
 with db() as c:
  try:uid=c.execute('INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)',(x.name.strip(),email,pwdhash(x.password),datetime.utcnow().isoformat())).lastrowid
  except sqlite3.IntegrityError:raise HTTPException(409,'Email already registered.')
  for n,t in DEFAULT:c.execute('INSERT OR IGNORE INTO categories(user_id,name,type,is_default) VALUES(?,?,?,1)',(uid,n,t))
 return {'token':token(uid),'user':{'id':uid,'name':x.name.strip(),'email':email}}
@app.post('/api/auth/login')
def login(x:Auth):
 with db() as c:u=c.execute('SELECT * FROM users WHERE email=?',(x.email.strip().lower(),)).fetchone()
 if not u or not checkpwd(x.password,u['password_hash']):raise HTTPException(401,'Incorrect email or password.')
 return {'token':token(u['id']),'user':{'id':u['id'],'name':u['name'],'email':u['email']}}
@app.get('/api/me')
def me(u=Depends(user_dep)):return {'user':u}
@app.get('/api/categories')
def categories(u=Depends(user_dep)):
 with db() as c:return [dict(r) for r in c.execute('SELECT id,name,type,is_default FROM categories WHERE user_id=? ORDER BY type,name',(u['id'],))]
@app.post('/api/categories')
def addcat(x:dict,u=Depends(user_dep)):
 n=str(x.get('name','')).strip()[:40];t=x.get('type')
 if len(n)<2 or t not in ('income','expense'):raise HTTPException(422,'Enter category and type.')
 with db() as c:
  try:c.execute('INSERT INTO categories(user_id,name,type) VALUES(?,?,?)',(u['id'],n,t))
  except sqlite3.IntegrityError:raise HTTPException(409,'Category already exists.')
  return dict(c.execute('SELECT * FROM categories WHERE user_id=? AND name=? AND type=?',(u['id'],n,t)).fetchone())
@app.get('/api/transactions')
def listtx(type:Optional[str]=None,category:Optional[str]=None,start:Optional[str]=None,end:Optional[str]=None,q:Optional[str]=None,limit:int=Query(200,ge=1,le=500),offset:int=0,u=Depends(user_dep)):
 sql='SELECT t.*,ca.name category FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.user_id=?';a=[u['id']]
 if type in ('income','expense'):sql+=' AND t.type=?';a.append(type)
 if category:sql+=' AND ca.name=?';a.append(category)
 if start:sql+=' AND t.transaction_date>=?';a.append(dt(start))
 if end:sql+=' AND t.transaction_date<=?';a.append(dt(end))
 if q:sql+=' AND (t.note LIKE ? OR ca.name LIKE ?)';a.extend([f'%{q[:80]}%',f'%{q[:80]}%'])
 sql+=' ORDER BY t.transaction_date DESC,t.id DESC LIMIT ? OFFSET ?';a.extend([limit,offset])
 with db() as c:return [dict(r) for r in c.execute(sql,a)]
@app.post('/api/transactions')
def create_tx(x:Tx,u=Depends(user_dep)):
 if x.type not in ('income','expense'):raise HTTPException(422,'Type must be income or expense.')
 with db() as c:
  cid=catid(c,u['id'],x.category,x.type); tid=c.execute('INSERT INTO transactions(user_id,category_id,type,amount,transaction_date,payment_method,note,created_at) VALUES(?,?,?,?,?,?,?,?)',(u['id'],cid,x.type,amt(x.amount),dt(x.transaction_date),x.payment_method[:40],x.note[:500],datetime.utcnow().isoformat())).lastrowid
  return dict(c.execute('SELECT t.*,ca.name category FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.id=?',(tid,)).fetchone())
@app.patch('/api/transactions/{tid}')
def edit_tx(tid:int,x:Tx,u=Depends(user_dep)):
 if x.type not in ('income','expense'):raise HTTPException(422,'Invalid type.')
 with db() as c:
  if not c.execute('SELECT id FROM transactions WHERE id=? AND user_id=?',(tid,u['id'])).fetchone():raise HTTPException(404,'Transaction not found.')
  cid=catid(c,u['id'],x.category,x.type);c.execute('UPDATE transactions SET category_id=?,type=?,amount=?,transaction_date=?,payment_method=?,note=? WHERE id=? AND user_id=?',(cid,x.type,amt(x.amount),dt(x.transaction_date),x.payment_method[:40],x.note[:500],tid,u['id']))
  return dict(c.execute('SELECT t.*,ca.name category FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.id=?',(tid,)).fetchone())
@app.delete('/api/transactions/{tid}')
def delete_tx(tid:int,u=Depends(user_dep)):
 with db() as c:
  cur=c.execute('DELETE FROM transactions WHERE id=? AND user_id=?',(tid,u['id']))
  if not cur.rowcount:raise HTTPException(404,'Transaction not found.')
 return {'deleted':True}
@app.get('/api/dashboard/summary')
def summary(month:Optional[int]=None,year:Optional[int]=None,u=Depends(user_dep)):
 today=date.today();m=month or today.month;y=year or today.year;s,e=bounds(y,m)
 with db() as c:
  t=totals(c,u['id'],s,e);cats=[dict(r) for r in c.execute("SELECT ca.name,SUM(t.amount) total FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.user_id=? AND t.type='expense' AND t.transaction_date BETWEEN ? AND ? GROUP BY ca.name ORDER BY total DESC",(u['id'],s,e))];daily=[dict(r) for r in c.execute("SELECT transaction_date,SUM(CASE WHEN type='income' THEN amount ELSE 0 END) income,SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) expense FROM transactions WHERE user_id=? AND transaction_date BETWEEN ? AND ? GROUP BY transaction_date ORDER BY transaction_date",(u['id'],s,e))];recent=[dict(r) for r in c.execute('SELECT t.*,ca.name category FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.user_id=? ORDER BY t.transaction_date DESC,t.id DESC LIMIT 5',(u['id'],))];g=c.execute("SELECT COUNT(*) count,COALESCE(SUM(current_amount),0) saved,COALESCE(SUM(target_amount),0) target FROM goals WHERE user_id=? AND status='active'",(u['id'],)).fetchone()
 return {'period':{'month':m,'year':y,'start':s,'end':e},'totals':t,'categories':cats,'daily':daily,'recent':recent,'goals':dict(g)}
@app.get('/api/budgets')
def budgets(month:Optional[int]=None,year:Optional[int]=None,u=Depends(user_dep)):
 d=date.today();m=month or d.month;y=year or d.year
 with db() as c:return budget_rows(c,u['id'],m,y)
@app.post('/api/budgets')
def save_budget(x:Budget,u=Depends(user_dep)):
 value=amt(x.limit_amount)
 with db() as c:
  cid=None
  if x.category:
   r=c.execute("SELECT id FROM categories WHERE user_id=? AND name=? AND type='expense'",(u['id'],x.category)).fetchone()
   if not r: raise HTTPException(422,'Choose an expense category.')
   cid=r['id']
  old=c.execute('SELECT id FROM budgets WHERE user_id=? AND category_id IS ? AND month=? AND year=?',(u['id'],cid,x.month,x.year)).fetchone()
  if old:c.execute('UPDATE budgets SET limit_amount=?,threshold_percent=? WHERE id=?',(value,x.threshold_percent,old['id']))
  else:c.execute('INSERT INTO budgets(user_id,category_id,month,year,limit_amount,threshold_percent) VALUES(?,?,?,?,?,?)',(u['id'],cid,x.month,x.year,value,x.threshold_percent))
  return budget_rows(c,u['id'],x.month,x.year)
@app.delete('/api/budgets/{bid}')
def delete_budget(bid:int,u=Depends(user_dep)):
 with db() as c:
  cur=c.execute('DELETE FROM budgets WHERE id=? AND user_id=?',(bid,u['id']))
  if not cur.rowcount:raise HTTPException(404,'Budget not found.')
 return {'deleted':True}
@app.get('/api/goals')
def goals(u=Depends(user_dep)):
 with db() as c:return [dict(r) for r in c.execute('SELECT * FROM goals WHERE user_id=? ORDER BY id DESC',(u['id'],))]
@app.post('/api/goals')
def add_goal(x:Goal,u=Depends(user_dep)):
 if len(x.title.strip())<2:raise HTTPException(422,'Enter goal title.')
 if x.target_date:dt(x.target_date)
 target=amt(x.target_amount);current=max(0,float(x.current_amount))
 with db() as c:
  gid=c.execute('INSERT INTO goals(user_id,title,target_amount,current_amount,target_date,status,created_at) VALUES(?,?,?,?,?,?,?)',(u['id'],x.title.strip()[:100],target,current,x.target_date,'completed' if current>=target else 'active',datetime.utcnow().isoformat())).lastrowid
  return dict(c.execute('SELECT * FROM goals WHERE id=?',(gid,)).fetchone())
@app.patch('/api/goals/{gid}')
def edit_goal(gid:int,x:GoalPatch,u=Depends(user_dep)):
 with db() as c:
  old=c.execute('SELECT * FROM goals WHERE id=? AND user_id=?',(gid,u['id'])).fetchone()
  if not old:raise HTTPException(404,'Goal not found.')
  title=(x.title or old['title']).strip()[:100];target=amt(x.target_amount) if x.target_amount is not None else old['target_amount'];cur=max(0,x.current_amount) if x.current_amount is not None else old['current_amount'];td=x.target_date if x.target_date is not None else old['target_date']
  if td:dt(td)
  c.execute('UPDATE goals SET title=?,target_amount=?,current_amount=?,target_date=?,status=? WHERE id=?',(title,target,cur,td,'completed' if cur>=target else 'active',gid));return dict(c.execute('SELECT * FROM goals WHERE id=?',(gid,)).fetchone())
@app.delete('/api/goals/{gid}')
def del_goal(gid:int,u=Depends(user_dep)):
 with db() as c:
  cur=c.execute('DELETE FROM goals WHERE id=? AND user_id=?',(gid,u['id']))
  if not cur.rowcount:raise HTTPException(404,'Goal not found.')
 return {'deleted':True}
@app.get('/api/recurring')
def recurring(u=Depends(user_dep)):
 with db() as c:return [dict(r) for r in c.execute('SELECT r.*,ca.name category FROM recurring_rules r LEFT JOIN categories ca ON ca.id=r.category_id WHERE r.user_id=? ORDER BY next_run_date',(u['id'],))]
@app.post('/api/recurring')
def add_recurring(x:Recurring,u=Depends(user_dep)):
 if x.type not in ('income','expense') or x.frequency not in ('weekly','monthly','yearly'):raise HTTPException(422,'Type or frequency is invalid.')
 with db() as c:
  cid=catid(c,u['id'],x.category,x.type);rid=c.execute('INSERT INTO recurring_rules(user_id,category_id,type,amount,frequency,next_run_date,payment_method,note) VALUES(?,?,?,?,?,?,?,?)',(u['id'],cid, x.type,amt(x.amount),x.frequency,dt(x.next_run_date),x.payment_method[:40],x.note[:500])).lastrowid
  return dict(c.execute('SELECT r.*,ca.name category FROM recurring_rules r LEFT JOIN categories ca ON ca.id=r.category_id WHERE r.id=?',(rid,)).fetchone())
def next_date(s,f):
 d=date.fromisoformat(s)
 if f=='weekly':d+=timedelta(days=7)
 elif f=='yearly':
  try:d=d.replace(year=d.year+1)
  except ValueError:d=d.replace(year=d.year+1,day=28)
 else:
  y=d.year+d.month//12;m=d.month%12+1;d=d.replace(year=y,month=m,day=min(d.day,calendar.monthrange(y,m)[1]))
 return d.isoformat()
@app.post('/api/recurring/process-due')
def process_due(u=Depends(user_dep)):
 created=0;today=date.today().isoformat()
 with db() as c:
  for r in c.execute('SELECT * FROM recurring_rules WHERE user_id=? AND active=1 AND next_run_date<=?',(u['id'],today)).fetchall():
   key=f"rule:{r['id']}:{r['next_run_date']}";cur=c.execute('INSERT OR IGNORE INTO transactions(user_id,category_id,type,amount,transaction_date,payment_method,note,recurring_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(u['id'],r['category_id'],r['type'],r['amount'],r['next_run_date'],r['payment_method'],r['note'],key,datetime.utcnow().isoformat()));created+=cur.rowcount
   c.execute('UPDATE recurring_rules SET next_run_date=? WHERE id=?',(next_date(r['next_run_date'],r['frequency']),r['id']))
 return {'created':created,'message':f'Created {created} due transaction(s).'}
@app.post('/api/imports/preview')
async def import_preview(file:UploadFile=File(...),u=Depends(user_dep)):
 if not file.filename.lower().endswith('.csv'):raise HTTPException(415,'Upload a .csv file.')
 raw=await file.read()
 if len(raw)>2_000_000:raise HTTPException(413,'CSV limit is 2 MB.')
 try:reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
 except Exception:raise HTTPException(422,'CSV must be UTF-8.')
 fields={f.strip().lower() for f in (reader.fieldnames or [])}
 if not {'type','amount','transaction_date'}.issubset(fields):raise HTTPException(422,'Required CSV columns: type, amount, transaction_date. Optional: category, payment_method, note.')
 rows=[];errors=[];seen=set()
 for i,row in enumerate(reader,2):
  r={(k or '').strip().lower():(v or '').strip() for k,v in row.items() if k}
  try:
   typ=r.get('type','').lower();a=amt(r.get('amount'));d=dt(r.get('transaction_date'))
   if typ not in ('income','expense'):raise ValueError('type must be income or expense')
   sig=(typ,a,d,r.get('category','Other'),r.get('note',''))
   if sig in seen:raise ValueError('duplicate row in file')
   seen.add(sig);rows.append({'type':typ,'amount':a,'transaction_date':d,'category':r.get('category') or ('Other' if typ=='expense' else 'Other income'),'payment_method':r.get('payment_method') or 'Other','note':r.get('note','')[:500],'row':i})
  except Exception as e:errors.append({'row':i,'error':str(e)})
 with db() as c:jid=c.execute('INSERT INTO import_jobs(user_id,filename,status,rows_processed,rows_rejected,created_at,preview_json) VALUES(?,?,?,?,?,?,?)',(u['id'],file.filename[:200],'preview',len(rows),len(errors),datetime.utcnow().isoformat(),json.dumps({'rows':rows,'errors':errors}))).lastrowid
 return {'job_id':jid,'filename':file.filename,'valid_rows':len(rows),'rejected_rows':len(errors),'rows':rows[:100],'errors':errors[:100]}
@app.post('/api/imports/{jid}/confirm')
def confirm_import(jid:int,u=Depends(user_dep)):
 created=0
 with db() as c:
  j=c.execute('SELECT * FROM import_jobs WHERE id=? AND user_id=?',(jid,u['id'])).fetchone()
  if not j:raise HTTPException(404,'Import job not found.')
  if j['status']=='completed':return {'created':j['rows_processed'],'message':'Already confirmed.'}
  for r in json.loads(j['preview_json'])['rows']:
   cid=catid(c,u['id'],r['category'],r['type']);dupe=c.execute('SELECT id FROM transactions WHERE user_id=? AND type=? AND amount=? AND transaction_date=? AND category_id=? AND note=?',(u['id'],r['type'],r['amount'],r['transaction_date'],cid,r['note'])).fetchone()
   if dupe:continue
   note=r['note'].lstrip();note="'"+note if note.startswith(('=','+','-','@','\t','\r')) else note
   c.execute('INSERT INTO transactions(user_id,category_id,type,amount,transaction_date,payment_method,note,import_reference,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(u['id'],cid,r['type'],r['amount'],r['transaction_date'],r['payment_method'],note,f"import:{jid}:{r['row']}",datetime.utcnow().isoformat()));created+=1
  c.execute("UPDATE import_jobs SET status='completed',rows_processed=? WHERE id=?",(created,jid))
 return {'created':created,'message':f'Imported {created}; duplicates skipped.'}
@app.get('/api/reports/export')
def export_csv(start:Optional[str]=None,end:Optional[str]=None,u=Depends(user_dep)):
 sql='SELECT t.type,t.amount,t.transaction_date,ca.name category,t.payment_method,t.note FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.user_id=?';a=[u['id']]
 if start:sql+=' AND t.transaction_date>=?';a.append(dt(start))
 if end:sql+=' AND t.transaction_date<=?';a.append(dt(end))
 sql+=' ORDER BY t.transaction_date DESC'
 with db() as c:rows=c.execute(sql,a).fetchall()
 out=io.StringIO();w=csv.writer(out);w.writerow(['type','amount','transaction_date','category','payment_method','note'])
 for r in rows:w.writerow([r['type'],r['amount'],r['transaction_date'],r['category'],r['payment_method'],r['note']])
 return Response(out.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename=expensewise_transactions.csv'})
@app.get('/api/reports/pdf')
def export_pdf(u=Depends(user_dep)):
 with db() as c:rows=c.execute('SELECT t.*,ca.name category FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.user_id=? ORDER BY transaction_date DESC LIMIT 500',(u['id'],)).fetchall()
 buf=io.BytesIO();p=canvas.Canvas(buf,pagesize=letter);w,h=letter;p.setFont('Helvetica-Bold',16);p.drawString(45,h-45,'ExpenseWise — Finance Report');p.setFont('Helvetica',9);p.drawString(45,h-63,f"User: {u['name']} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}");income=sum(r['amount'] for r in rows if r['type']=='income');expense=sum(r['amount'] for r in rows if r['type']=='expense');p.drawString(45,h-83,f'Income {income:.2f} | Expenses {expense:.2f} | Net {income-expense:.2f}');y=h-110
 for r in rows:
  if y<45:p.showPage();y=h-45;p.setFont('Helvetica',8)
  p.setFont('Helvetica',8);p.drawString(45,y,str(r['transaction_date']));p.drawString(115,y,r['type']);p.drawString(165,y,str(r['category'] or '')[:18]);p.drawRightString(285,y,f"{r['amount']:.2f}");p.drawString(305,y,str(r['note'] or '')[:45]);y-=13
 p.save();buf.seek(0);return Response(buf.getvalue(),media_type='application/pdf',headers={'Content-Disposition':'attachment; filename=expensewise_report.pdf'})
@app.get('/api/insights')
def insights(u=Depends(user_dep)):
 today=date.today();start=today.replace(day=1).isoformat();end=today.isoformat();prev_end=today.replace(day=1)-timedelta(days=1);prev_start=prev_end.replace(day=1);msgs=[]
 with db() as c:
  now=totals(c,u['id'],start,end);prev=totals(c,u['id'],prev_start.isoformat(),prev_end.isoformat());cats=c.execute("SELECT ca.name,SUM(t.amount) total FROM transactions t LEFT JOIN categories ca ON ca.id=t.category_id WHERE t.user_id=? AND t.type='expense' AND t.transaction_date BETWEEN ? AND ? GROUP BY ca.name ORDER BY total DESC",(u['id'],start,end)).fetchall();bs=budget_rows(c,u['id'],today.month,today.year)
 if now['income']==0 and now['expense']==0:msgs.append({'type':'info','title':'Start tracking','message':'Add transactions to unlock personalized insights.'})
 if prev['expense']>0:
  change=(now['expense']-prev['expense'])/prev['expense']*100;msgs.append({'type':'warning' if change>15 else 'success','title':'Monthly spending comparison','message':f'Spending is {abs(change):.1f}% '+('higher' if change>0 else 'lower')+' than last month total.'})
 for b in bs:
  if b['percent']>=b['threshold_percent']:msgs.append({'type':'danger' if b['percent']>=100 else 'warning','title':'Budget alert','message':f"{b['category'] or 'Overall'} budget is {b['percent']:.0f}% used."})
 if cats:msgs.append({'type':'info','title':'Top spending category','message':f"{cats[0]['name']}: {cats[0]['total']:.2f} spent this month."})
 msgs.append({'type':'info','title':'About these insights','message':'Explainable rules based on your records; not financial advice or a trained AI model.'})
 return {'insights':msgs,'current_month':now,'previous_month':prev}
@app.get('/api/alerts')
def alerts(u=Depends(user_dep)):
 d=date.today()
 with db() as c:bs=budget_rows(c,u['id'],d.month,d.year)
 return [{'severity':'danger' if b['percent']>=100 else 'warning','message':f"{b['category'] or 'Overall'} budget: {b['percent']:.0f}% used",'budget':b} for b in bs if b['percent']>=b['threshold_percent']]
