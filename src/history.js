export class ProjectHistory {
 constructor(limit=80){this.limit=limit;this.past=[];this.future=[];this.current=null;}
 seed(model){this.current=JSON.stringify(model);this.past=[];this.future=[];}
 capture(model){const value=JSON.stringify(model);if(value===this.current)return false;if(this.current!==null)this.past.push(this.current);if(this.past.length>this.limit)this.past.shift();this.current=value;this.future=[];return true;}
 undo(){if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return JSON.parse(this.current);}
 redo(){if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return JSON.parse(this.current);}
 get canUndo(){return this.past.length>0;}
 get canRedo(){return this.future.length>0;}
}
