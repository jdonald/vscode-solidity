import * as vscode from 'vscode';

export class SolidityCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command[] {
        let diagnostic: vscode.Diagnostic = context.diagnostics[0];
        return [{
            title: 'Let\'s fix the tabbing with a code action',
            command: 'solidity.runCodeAction',
            arguments: [document, diagnostic.range, diagnostic.message ]
        },
        {
            title: 'Another code action',
            command: 'solidity.runAnotherCodeAction',
            arguments: [document, diagnostic.range, diagnostic.message ]
        }];
    }

    public runCodeAction(document: vscode.TextDocument, range: vscode.Range, message:string): any {
        if (1) {
            var firstLine = document.lineAt(0);
            var lastLine = document.lineAt(document.lineCount - 1);
            var newRange = new vscode.Range(0, 
                firstLine.range.start.character, 
                document.lineCount - 1, 
                lastLine.range.end.character);
            let newText: string = document.getText(newRange).replace(/  /g, '    ');
            let edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, newRange, newText);
            return vscode.workspace.applyEdit(edit);
        } else {
            vscode.window.showErrorMessage("The suggestion was not applied because we want to throw an error message");
        }
    }

    public runAnotherCodeAction(document: vscode.TextDocument, range: vscode.Range, message:string): any {
        let newText: string = document.getText(range).replace(/uint160\((.+)\)/, "address(uint160($1))");
        let edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, newText);
        return vscode.workspace.applyEdit(edit);
    }
}   
